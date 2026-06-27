from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Any, Dict
import uvicorn
import os
from redis import Redis
from rq import Queue, Retry
from dotenv import load_dotenv

# Ensure we can import from src
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import config
from src.workflows.command_workflow import run_command_workflow, report_rq_failure

load_dotenv()

app = FastAPI(title="Agentic Outreach Worker")

# Initialize Redis and RQ
redis_conn = Redis.from_url(config.REDIS_URL)
job_queue = Queue("agentic_outreach_jobs", connection=redis_conn)

class CommandRequest(BaseModel):
    workspace_id: str
    command_id: Optional[str] = None
    user_id: Optional[str] = None
    job_id: str
    message: str
    mock_mode: bool = True
    plan: Optional[Dict[str, Any]] = None
    workspaceProfile: Optional[Dict[str, Any]] = None
    userProfile: Optional[Dict[str, Any]] = None

@app.get("/")
async def root():
    try:
        redis_conn.ping()
        return {"status": "online", "message": "Agentic Outreach Worker is ready.", "queue_count": len(job_queue)}
    except Exception as error:
        return JSONResponse({"status": "degraded", "redis": "unavailable", "error": str(error)}, status_code=503)

@app.get("/health/live")
async def health_live():
    """Liveness check - verify FastAPI process is running."""
    return {"status": "alive"}

@app.get("/health/ready")
async def health_ready():
    """Readiness check - verify Redis connection and configuration."""
    try:
        redis_conn.ping()
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Redis is unavailable: {error}")
    
    if not config.INTERNAL_API_KEY or not config.WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Required configuration keys are missing")
        
    return {"status": "ready"}

class PlanRequest(BaseModel):
    message: str
    userProfile: Optional[Dict[str, Any]] = None
    workspaceProfile: Optional[Dict[str, Any]] = None

@app.post("/commands/plan")
async def plan_command(request: PlanRequest):
    """
    Synchronously understands the user's message and returns a structured plan.
    Used by the web backend for the initial 'Command Plan Card' step.
    """
    from src.agents.command_understanding_agent import CommandUnderstandingAgent
    understander = CommandUnderstandingAgent()
    plan = understander.understand(request.message, request.userProfile, request.workspaceProfile)
    return plan

@app.post("/commands/execute")
async def execute_command(request: CommandRequest):
    """
    Queues the CommandWorkflow into Redis for durable execution.
    """
    print(f"Queueing command: {request.command_id} for workspace {request.workspace_id}")
    
    # Queue the job with a timeout and retry policy
    # timeout: 30 minutes (1800s) for long scraping jobs
    # retry: 3 attempts
    job = job_queue.enqueue(
        run_command_workflow,
        args=(
            request.workspace_id,
            request.command_id,
            request.message,
            request.job_id,
            request.mock_mode,
            request.plan,
            request.workspaceProfile,
            request.userProfile
        ),
        job_id=request.job_id,
        job_timeout=1800,
        retry=Retry(max=3, interval=[10, 30, 60]),
        result_ttl=86400,
        failure_ttl=604800,
        on_failure=report_rq_failure,
    )
    
    return {
        "status": "queued", 
        "message": "Workflow queued in Redis",
        "job_id": job.id
    }


class RunRequest(BaseModel):
    workspace_id: str
    job_id: str
    prompt: str
    intent: str
    parameters: Dict[str, Any] = {}

def _check_internal_key(req: Request):
    """Validates X-Internal-Api-Key header for internal API calls."""
    key = config.INTERNAL_API_KEY
    if key and req.headers.get("x-internal-api-key") != key:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/run")
async def run_intent(request: RunRequest, req: Request):
    """
    Directly executes an intent in the background via RQ.
    Used by FollowUpService to dispatch follow-up drafting tasks.
    """
    _check_internal_key(req)
    print(f"[Worker /run] intent={request.intent} job_id={request.job_id}")
    
    # Build a synthetic prompt that the workflow can parse
    prompt = request.prompt
    
    # Pass parameters by embedding them into a special format or use a wrapper
    # The run_command_workflow handles intent detection from the prompt
    # We pass parameters separately by encoding them in the prompt
    import json as _json
    enriched_prompt = f"{prompt} __params__:{_json.dumps(request.parameters)}"

    job = job_queue.enqueue(
        run_command_workflow,
        args=(request.workspace_id, None, enriched_prompt, request.job_id, False),
        job_id=request.job_id,
        job_timeout=300,
        retry=Retry(max=2, interval=[15, 30]),
        result_ttl=3600,
        failure_ttl=86400,
        on_failure=report_rq_failure,
    )
    
    return {"status": "queued", "job_id": job.id, "intent": request.intent}


class RewriteRequest(BaseModel):
    workspace_id: str
    lead_id: str
    campaign_id: Optional[str] = None
    original_subject: str
    original_body: str
    instruction: str

@app.post("/rewrite")
async def rewrite_email(request: RewriteRequest, req: Request):
    """
    Rewrites an existing email draft using the LLM based on an instruction.
    Used by DraftService.rewriteWithAI().
    """
    _check_internal_key(req)
    
    import litellm
    import json as _json
    from src.services.memory_service import memory_service

    # Load memory context for personalization
    memory = memory_service.get_relevant_memory(request.workspace_id, request.lead_id, request.campaign_id)
    workspace_facts = "\n".join([f"- {m['title']}: {m['content']}" for m in memory.get("workspace", [])])
    campaign_learnings = "\n".join([f"- {m['memoryType']}: {m['content']}" for m in memory.get("campaign", [])])

    system_prompt = f"""You are an expert email copywriter specializing in cold outreach.
Rewrite the given email according to the user's instruction, while keeping it personalized and professional.

BUSINESS FACTS:
{workspace_facts}

CAMPAIGN LEARNINGS:
{campaign_learnings}

RULES:
- Keep the email concise and direct.
- Preserve the core value proposition.
- Match the tone requested in the instruction.
- Never hallucinate facts not in the context.
- Return ONLY a JSON object with "subject" and "body" fields."""

    user_prompt = f"""Original Subject: {request.original_subject}
Original Body: {request.original_body}

Instruction: {request.instruction}

Return a JSON object with:
- subject: The new subject line
- body: The rewritten email body"""

    try:
        response = litellm.completion(
            model=config.ACTIVE_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        result = _json.loads(response.choices[0].message.content)
        return {"subject": result.get("subject", request.original_subject), "body": result.get("body", request.original_body)}
    except Exception as e:
        print(f"[Worker /rewrite] LLM error: {e}")
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
