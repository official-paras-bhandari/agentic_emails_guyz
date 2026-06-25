'use client';

import Link from 'next/link';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Search, Users, Plus, FolderOpen, Trash2, CheckSquare, Square, X, 
  FolderMinus, Loader2, Upload, FileSpreadsheet, Check, ChevronRight, AlertCircle
} from 'lucide-react';

type Lead = {
  id: string;
  businessName?: string | null;
  email?: string | null;
  website?: string | null;
  suburb?: string | null;
  status: string;
  createdAt: string;
  firstName?: string | null;
  lastName?: string | null;
  groups?: {
    groupId: string;
    group: {
      id: string;
      name: string;
    };
  }[];
};

type LeadGroup = {
  id: string;
  name: string;
  description?: string | null;
  _count: {
    leads: number;
  };
};

function LeadsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [groups, setGroups] = useState<LeadGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Group creation modal/state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Dropdowns
  const [showAddToGroupDropdown, setShowAddToGroupDropdown] = useState(false);
  const [selectedGroupsToAssign, setSelectedGroupsToAssign] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showAddToCampaignDropdown, setShowAddToCampaignDropdown] = useState(false);

  // CSV Import Wizard State
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1 = Upload, 2 = Mapping, 3 = Progress & Results
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importingLeads, setImportingLeads] = useState(false);
  const [importSummary, setImportSummary] = useState({ importedCount: 0, skippedCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create Lead manual modal/state
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({
    firstName: '',
    lastName: '',
    businessName: '',
    email: '',
    website: '',
    phone: '',
    suburb: ''
  });
  const [leadFormError, setLeadFormError] = useState('');
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  // Load Groups
  const loadGroups = async () => {
    try {
      const url = workspaceId ? `/api/leads/groups?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/leads/groups';
      const r = await fetch(url);
      if (r.ok) {
        setGroups(await r.json());
      }
    } catch (err) {
      console.error('Failed to load lead groups:', err);
    }
  };

  // Load Campaigns
  const loadCampaigns = async () => {
    try {
      const url = workspaceId ? `/api/campaigns?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/campaigns';
      const r = await fetch(url);
      if (r.ok) {
        setCampaigns(await r.json());
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  };

  const handleBulkAddLeadsToCampaign = async (campaignId: string) => {
    if (selectedLeadIds.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        selectedLeadIds.map(async (leadId) => {
          try {
            const r = await fetch(`/api/campaigns/${campaignId}/leads`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leadId, workspaceId })
            });
            if (!r.ok) {
              const errData = await r.json().catch(() => ({ error: 'Request failed' }));
              return { leadId, ok: false, error: errData.error || 'Failed to add' };
            }
            return { leadId, ok: true };
          } catch (err: any) {
            return { leadId, ok: false, error: err.message };
          }
        })
      );

      const failed = results.filter(res => !res.ok);
      if (failed.length > 0) {
        const leadNames = failed.map(f => {
          const lead = leads.find(l => l.id === f.leadId);
          return lead ? (lead.businessName || lead.email || 'Unnamed') : 'Unnamed';
        });
        setError(`Successfully added ${results.length - failed.length} leads. Failed to add ${failed.length} leads (${leadNames.join(', ')}). Reason: ${failed[0].error}`);
      } else {
        alert(`Successfully added ${selectedLeadIds.length} leads to campaign.`);
      }
      setSelectedLeadIds([]);
      setShowAddToCampaignDropdown(false);
      await loadLeads(query, selectedGroupId);
    } catch (err: any) {
      setError(err.message || 'Failed to add leads to campaign');
    } finally {
      setLoading(false);
    }
  };

  // Load Leads
  const loadLeads = async (searchQuery = '', groupId: string | null = null) => {
    setLoading(true);
    try {
      let url = '/api/leads?';
      if (searchQuery) url += `q=${encodeURIComponent(searchQuery)}&`;
      if (groupId) url += `groupId=${groupId}&`;
      if (workspaceId) url += `workspaceId=${encodeURIComponent(workspaceId)}&`;
      
      const r = await fetch(url);
      if (!r.ok) throw new Error('Unable to load leads');
      setLeads(await r.json());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
    loadCampaigns();
    loadLeads(query, selectedGroupId);
    setSelectedLeadIds([]);
  }, [selectedGroupId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLeads(query, selectedGroupId);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadFormError('');
    
    // Ensure at least one identifying property
    if (!newLeadData.businessName && !newLeadData.email && !newLeadData.website) {
      setLeadFormError('Business Name, Email or Website is required.');
      return;
    }

    setIsSubmittingLead(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLeadData,
          workspaceId
        })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create lead');
      }

      if (data.duplicate) {
        setLeadFormError(`Lead already exists (Reason: ${data.reason})`);
        setIsSubmittingLead(false);
        return;
      }

      // Add to list and reset form
      setLeads([data, ...leads]);
      setNewLeadData({
        firstName: '',
        lastName: '',
        businessName: '',
        email: '',
        website: '',
        phone: '',
        suburb: ''
      });
      setShowCreateLeadModal(false);
    } catch (err: any) {
      setLeadFormError(err.message || 'An error occurred while creating the lead.');
    } finally {
      setIsSubmittingLead(false);
    }
  };

  // Checkbox handlers
  const handleToggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const handleToggleSelectLead = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(lid => lid !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  // Bulk Actions
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setCreatingGroup(true);
    try {
      const r = await fetch('/api/leads/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim(), workspaceId })
      });
      if (!r.ok) throw new Error('Failed to create group');
      
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateGroup(false);
      await loadGroups();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleBulkAddLeadsToGroups = async () => {
    if (selectedLeadIds.length === 0 || selectedGroupsToAssign.length === 0) return;
    try {
      await Promise.all(
        selectedGroupsToAssign.map(groupId =>
          fetch('/api/leads/groups/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, leadIds: selectedLeadIds, workspaceId })
          })
        )
      );
      setSelectedLeadIds([]);
      setSelectedGroupsToAssign([]);
      setShowAddToGroupDropdown(false);
      await loadGroups();
      await loadLeads(query, selectedGroupId);
    } catch (err: any) {
      setError(err.message || 'Failed to add leads to groups');
    }
  };

  const handleRemoveLeadsFromGroup = async () => {
    if (selectedLeadIds.length === 0 || !selectedGroupId) return;
    try {
      const r = await fetch('/api/leads/groups/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, leadIds: selectedLeadIds, workspaceId })
      });
      if (!r.ok) throw new Error('Failed to remove leads from group');
      
      setSelectedLeadIds([]);
      await loadGroups();
      await loadLeads(query, selectedGroupId);
    } catch (err: any) {
      setError(err.message || 'Failed to remove leads');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedLeadIds.length} selected leads? All associated drafts, follow-ups, and logs will be permanently deleted.`)) return;
    
    try {
      const r = await fetch('/api/leads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedLeadIds, workspaceId })
      });
      if (!r.ok) throw new Error('Failed to delete leads');
      
      setSelectedLeadIds([]);
      await loadGroups();
      await loadLeads(query, selectedGroupId);
    } catch (err: any) {
      setError(err.message || 'Failed to delete leads');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['First Name', 'Last Name', 'Business', 'Email', 'Website', 'Suburb', 'Status'],
      ...leads.map(l => [l.firstName || '', l.lastName || '', l.businessName || '', l.email || '', l.website || '', l.suburb || '', l.status])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'leads.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // CSV Parsing helper (supports quoted comma strings)
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentValue.trim());
        currentValue = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        row.push(currentValue.trim());
        lines.push(row);
        row = [];
        currentValue = '';
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
      } else {
        currentValue += char;
      }
    }
    
    if (currentValue || row.length > 0) {
      row.push(currentValue.trim());
      lines.push(row);
    }

    return lines.filter(r => r.length > 0 && r.some(cell => cell !== ''));
  };

  // Auto-mapping heuristics
  const findCloseMatch = (field: string, headers: string[]): string => {
    const fLower = field.toLowerCase();
    
    const aliases: Record<string, string[]> = {
      firstName: ['first name', 'firstname', 'fname', 'first', 'given name', 'contact first name'],
      lastName: ['last name', 'lastname', 'lname', 'last', 'surname', 'family name', 'contact last name'],
      businessName: ['business name', 'company', 'business', 'company name', 'organization', 'org', 'store name'],
      email: ['email', 'email address', 'mail', 'email_address', 'e-mail'],
      website: ['website', 'url', 'web', 'domain', 'site', 'homepage'],
      phone: ['phone', 'telephone', 'mobile', 'tel', 'phone number', 'cell'],
      suburb: ['suburb', 'city', 'location', 'town', 'address', 'region']
    };

    const fieldAliases = aliases[field] || [];
    
    for (const h of headers) {
      const hLower = h.toLowerCase().trim();
      if (hLower === fLower) return h;
      if (fieldAliases.some(alias => hLower.includes(alias) || alias.includes(hLower))) {
        return h;
      }
    }
    return '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        
        if (parsed.length === 0) {
          throw new Error('CSV file is empty');
        }

        const headers = parsed[0];
        const rows = parsed.slice(1);
        
        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto map columns
        const initialMapping: Record<string, string> = {};
        const targetFields = ['firstName', 'lastName', 'businessName', 'email', 'website', 'phone', 'suburb'];
        
        targetFields.forEach(field => {
          initialMapping[field] = findCloseMatch(field, headers);
        });

        setColumnMapping(initialMapping);
        setImportStep(2); // Go to mapping step
      } catch (err: any) {
        alert(err.message || 'Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const getMappedVal = (field: string, row: string[]): string => {
    const header = columnMapping[field];
    if (!header) return '';
    const idx = csvHeaders.indexOf(header);
    return idx !== -1 ? row[idx] || '' : '';
  };

  const handleRunImport = async () => {
    setImportingLeads(true);
    try {
      const mappedLeads = csvRows.map(row => {
        const lead: Record<string, any> = {};
        Object.entries(columnMapping).forEach(([field, header]) => {
          if (header) {
            const idx = csvHeaders.indexOf(header);
            if (idx !== -1) {
              lead[field] = row[idx] || '';
            }
          }
        });
        return lead;
      });

      const r = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: mappedLeads, workspaceId })
      });

      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || 'Failed to import leads');
      }

      const summary = await r.json();
      setImportSummary({
        importedCount: summary.importedCount,
        skippedCount: summary.skippedCount
      });
      
      setImportStep(3); // Show results
      await loadLeads(query, selectedGroupId);
      await loadGroups();
    } catch (err: any) {
      alert(err.message || 'An error occurred during import');
    } finally {
      setImportingLeads(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6 relative min-h-screen pb-32">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800/40 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Lead Database</h1>
          <p className="text-zinc-500 mt-1">Manage, categorize, and view outreach targets.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setLeadFormError('');
              setShowCreateLeadModal(true);
            }} 
            className="rounded-xl border border-zinc-800 bg-zinc-955 hover:bg-zinc-900/50 px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4 text-zinc-400" />
            <span>Create Lead</span>
          </button>
          <button 
            onClick={() => {
              setImportStep(1);
              setShowImportWizard(true);
            }} 
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-sm font-semibold transition-all shadow-[0_0_10px_rgba(59,130,246,0.15)] flex items-center gap-1.5"
          >
            <Upload className="h-4 w-4" />
            <span>Import Leads (CSV)</span>
          </button>
          <button onClick={exportCsv} className="rounded-xl border border-zinc-800 bg-zinc-950/20 hover:bg-zinc-900/50 px-4 py-2.5 text-sm font-semibold transition-all">
            Export CSV
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Column: Lead Groups Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Lead Groups</h2>
            <button
              onClick={() => setShowCreateGroup(!showCreateGroup)}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
              title="Create New Group"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Create Group Inline Form */}
          {showCreateGroup && (
            <form onSubmit={handleCreateGroup} className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-1">
                <input
                  required
                  type="text"
                  placeholder="Group Name"
                  className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 text-zinc-100"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <textarea
                  placeholder="Description (Optional)"
                  rows={2}
                  className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 text-zinc-100 resize-none"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="px-2.5 py-1 text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1 rounded-md transition-colors"
                >
                  {creatingGroup ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          )}

          {/* Groups List */}
          <div className="space-y-1">
            <button
              onClick={() => setSelectedGroupId(null)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                selectedGroupId === null
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                  : 'hover:bg-zinc-900/40 text-zinc-400 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>All Leads</span>
              </div>
            </button>

            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  selectedGroupId === group.id
                    ? 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                    : 'hover:bg-zinc-900/40 text-zinc-400 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="h-4 w-4 text-zinc-500" />
                  <span className="truncate">{group.name}</span>
                </div>
                <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">
                  {group._count.leads}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Lead list table */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-850 bg-zinc-950/20 px-3.5 focus-within:border-blue-500 transition-all">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                className="w-full bg-transparent py-3 text-sm outline-none placeholder-zinc-600 text-zinc-200"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, business, email, website or suburb..."
              />
            </div>
            <button className="rounded-xl bg-zinc-900 hover:bg-zinc-850 px-5 text-sm font-semibold text-white border border-zinc-800 transition-all">
              Search
            </button>
          </form>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Table container */}
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/10">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/40 border-b border-zinc-800 text-left text-zinc-400">
                <tr>
                  <th className="p-3.5 w-10">
                    <button 
                      type="button" 
                      onClick={handleToggleSelectAll}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {selectedLeadIds.length === leads.length && leads.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-xs">Business / Contact</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-xs">Email</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-xs">Suburb</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-xs">Status</th>
                  <th className="p-3.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-855">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-zinc-500">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-500" />
                      <span>Loading leads...</span>
                    </td>
                  </tr>
                ) : leads.map((l) => (
                  <tr 
                    key={l.id} 
                    className={`hover:bg-zinc-900/20 transition-colors ${
                      selectedLeadIds.includes(l.id) ? 'bg-blue-900/5' : ''
                    }`}
                  >
                    <td className="p-3.5">
                      <button 
                        type="button" 
                        onClick={() => handleToggleSelectLead(l.id)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {selectedLeadIds.includes(l.id) ? (
                          <CheckSquare className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-zinc-200">{l.businessName || 'Unnamed business'}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-zinc-500">
                        {(l.firstName || l.lastName) && (
                          <span>
                            Contact: {l.firstName || ''} {l.lastName || ''}
                          </span>
                        )}
                        {l.groups && l.groups.length > 0 && (
                          <>
                            {(l.firstName || l.lastName) && <span>·</span>}
                            <div className="flex flex-wrap gap-1">
                              {l.groups.map((lg) => (
                                <span 
                                  key={lg.groupId} 
                                  className="text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-450 px-1 py-0.2 rounded"
                                >
                                  {lg.group.name}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-zinc-400">{l.email || 'No email'}</td>
                    <td className="p-3.5 text-zinc-450">{l.suburb || '—'}</td>
                    <td className="p-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        l.status === 'scraped' 
                          ? 'bg-blue-500/10 text-blue-500' 
                          : l.status === 'duplicate' 
                            ? 'bg-zinc-800 text-zinc-500' 
                            : 'bg-green-500/10 text-green-500'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <Link href={`/leads/${l.id}`} className="text-blue-500 hover:text-blue-400 font-semibold text-xs transition-colors">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                
                {!leads.length && !loading && (
                  <tr>
                    <td colSpan={6} className="p-16 text-center text-zinc-500">
                      <Users className="mx-auto mb-3 h-8 w-8 text-zinc-650" />
                      <p className="font-bold text-zinc-400">No leads found</p>
                      <p className="text-xs text-zinc-600 mt-1">This segment or search query returned no records.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-between items-center text-xs text-zinc-500">
            <span>{leads.length} leads displayed</span>
            {selectedLeadIds.length > 0 && (
              <span className="text-blue-400 font-medium">{selectedLeadIds.length} leads selected</span>
            )}
          </div>
        </div>

      </div>

      {/* Floating Dark Glassmorphic Action Bar */}
      <div 
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-950/80 backdrop-blur-xl border border-zinc-805 shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-2xl px-6 py-4 flex items-center gap-6 transition-all duration-300 w-full max-w-2xl ${
          selectedLeadIds.length > 0 ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex-1 min-w-0">
          <span className="text-xs text-zinc-400 font-medium">
            <span className="font-extrabold text-blue-400">{selectedLeadIds.length}</span> leads selected
          </span>
        </div>

        <div className="flex items-center gap-2 relative">
                  {/* Add to Group dropdown toggle */}
          <button 
            onClick={() => {
              setShowAddToGroupDropdown(!showAddToGroupDropdown);
              setShowAddToCampaignDropdown(false);
            }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-[0_0_10px_rgba(59,130,246,0.15)]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Add to Group...</span>
          </button>

          {/* Add to Group Dropdown menu */}
          {showAddToGroupDropdown && (
            <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1 shadow-2xl w-52 text-xs font-semibold text-zinc-300 animate-in fade-in slide-in-from-bottom-2 duration-150 z-50">
              <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-550 uppercase tracking-wider border-b border-zinc-800">
                Select Groups
              </div>
              <div className="max-h-36 overflow-y-auto custom-scrollbar my-1">
                {groups.map(g => {
                  const isChecked = selectedGroupsToAssign.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          setSelectedGroupsToAssign(selectedGroupsToAssign.filter(id => id !== g.id));
                        } else {
                          setSelectedGroupsToAssign([...selectedGroupsToAssign, g.id]);
                        }
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-zinc-800 rounded-md transition-colors flex items-center justify-between"
                    >
                      <span className="truncate pr-2">{g.name}</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="rounded border-zinc-800 bg-zinc-950 text-blue-500 h-3 w-3 shrink-0"
                      />
                    </button>
                  );
                })}
                {groups.length === 0 && (
                  <div className="px-2 py-2 text-zinc-550 italic text-[11px]">No groups found. Create one.</div>
                )}
              </div>
              <div className="h-[1px] bg-zinc-800 my-1" />
              {selectedGroupsToAssign.length > 0 ? (
                <button
                  type="button"
                  onClick={handleBulkAddLeadsToGroups}
                  className="w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 rounded-lg transition-colors text-[10px] uppercase tracking-wider"
                >
                  Apply to {selectedGroupsToAssign.length} Groups
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowAddToGroupDropdown(false);
                    setShowCreateGroup(true);
                  }}
                  className="w-full text-left text-blue-500 px-2 py-1.5 hover:bg-zinc-800 rounded-md transition-colors flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create new group</span>
                </button>
              )}
            </div>
          )}

          {/* Add to Campaign dropdown toggle */}
          <button 
            onClick={() => {
              setShowAddToCampaignDropdown(!showAddToCampaignDropdown);
              setShowAddToGroupDropdown(false);
            }}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-[0_0_10px_rgba(99,102,241,0.15)]"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Add to Campaign...</span>
          </button>

          {/* Add to Campaign Dropdown menu */}
          {showAddToCampaignDropdown && (
            <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1 shadow-2xl w-56 text-xs font-semibold text-zinc-300 animate-in fade-in slide-in-from-bottom-2 duration-150 z-50">
              <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-550 uppercase tracking-wider border-b border-zinc-800">
                Select Campaign
              </div>
              <div className="max-h-36 overflow-y-auto custom-scrollbar my-1">
                {campaigns.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleBulkAddLeadsToCampaign(c.id)}
                    className="w-full text-left px-2 py-1.5 hover:bg-zinc-800 rounded-md transition-colors block truncate"
                  >
                    {c.name}
                  </button>
                ))}
                {campaigns.length === 0 && (
                  <div className="px-2 py-2 text-zinc-550 italic text-[11px]">No campaigns found.</div>
                )}
              </div>
            </div>
          )}

          {/* Remove from Group (Only if filtering by a group) */}
          {selectedGroupId && (
            <button 
              onClick={handleRemoveLeadsFromGroup}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-red-400 hover:text-red-300 font-bold px-3.5 py-2 rounded-xl text-xs transition-all"
            >
              <FolderMinus className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          )}

          {/* Bulk Delete Button */}
          <button 
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 bg-red-955/30 hover:bg-red-955/60 border border-red-900/40 text-red-400 font-bold px-3.5 py-2 rounded-xl text-xs transition-all"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-400" />
            <span>Delete</span>
          </button>

          <button 
            onClick={() => setSelectedLeadIds([])}
            className="p-2 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Deselect All"
          >
            <X className="h-4 w-4" />
          </button>

        </div>
      </div>

      {/* CSV Import Wizard Modal */}
      {showImportWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-3xl border border-zinc-800 bg-[#09090b] rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-zinc-150">
                  {importStep === 1 && "Upload Lead List (CSV)"}
                  {importStep === 2 && "Map Spreadsheet Columns"}
                  {importStep === 3 && "Import Completed"}
                </h3>
              </div>
              {importStep !== 3 && !importingLeads && (
                <button 
                  onClick={() => setShowImportWizard(false)}
                  className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              
              {/* STEP 1: Upload File */}
              {importStep === 1 && (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-800 hover:border-blue-500/50 bg-zinc-950/20 hover:bg-zinc-950/40 rounded-2xl p-12 text-center cursor-pointer transition-all flex flex-col items-center group"
                >
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                  />
                  <Upload className="h-10 w-10 text-zinc-650 group-hover:text-blue-400 transition-colors mb-4" />
                  <p className="font-semibold text-zinc-250">Click or drag a CSV file to upload</p>
                  <p className="text-xs text-zinc-550 mt-1">Supports spreadsheet column mappings for names, emails, websites, etc.</p>
                </div>
              )}

              {/* STEP 2: Column Mapping */}
              {importStep === 2 && (
                <div className="space-y-6">
                  
                  {/* Mapping Fields Grid */}
                  <div className="grid md:grid-cols-2 gap-4">
                    
                    {/* Mapper Left: Field mapping drops */}
                    <div className="space-y-3.5 bg-zinc-950/20 border border-zinc-900 p-4 rounded-2xl">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pb-2 border-b border-zinc-900">
                        Map System Fields
                      </div>

                      {[
                        { label: 'First Name', field: 'firstName' },
                        { label: 'Last Name', field: 'lastName' },
                        { label: 'Business Name', field: 'businessName' },
                        { label: 'Email', field: 'email' },
                        { label: 'Website / URL', field: 'website' },
                        { label: 'Phone', field: 'phone' },
                        { label: 'Suburb / Location', field: 'suburb' }
                      ].map((item) => (
                        <div key={item.field} className="flex items-center justify-between gap-4 text-xs">
                          <span className="font-semibold text-zinc-400 shrink-0">{item.label}</span>
                          <select
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 max-w-[180px] text-zinc-200"
                            value={columnMapping[item.field] || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, [item.field]: e.target.value })}
                          >
                            <option value="">— Ignore Field —</option>
                            {csvHeaders.map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Mapper Right: Live mapping preview */}
                    <div className="flex flex-col justify-between space-y-4">
                      
                      {/* Preview Description */}
                      <div className="bg-zinc-950/30 border border-zinc-900 p-4 rounded-2xl text-xs text-zinc-400 space-y-2">
                        <h4 className="font-bold text-zinc-300">Spreadsheet Columns Detected:</h4>
                        <div className="flex flex-wrap gap-1">
                          {csvHeaders.map(h => (
                            <span key={h} className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-450 px-2 py-0.5 rounded">
                              {h}
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-zinc-500 pt-2">
                          We mapped fields matching close headers automatically. Please double check that mapped values are correct.
                        </p>
                      </div>

                      {/* Preview Table */}
                      <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-2xl space-y-2 flex-1">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-900 pb-2">
                          Preview (First 3 Rows)
                        </div>
                        <div className="overflow-x-auto text-[10px] custom-scrollbar max-h-36">
                          <table className="w-full text-left">
                            <thead className="text-zinc-550 border-b border-zinc-900">
                              <tr>
                                <th className="pb-1.5 font-bold uppercase">Business</th>
                                <th className="pb-1.5 font-bold uppercase">Email</th>
                                <th className="pb-1.5 font-bold uppercase">Contact</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900">
                              {csvRows.slice(0, 3).map((row, idx) => {
                                const biz = getMappedVal('businessName', row);
                                const email = getMappedVal('email', row);
                                const fn = getMappedVal('firstName', row);
                                const ln = getMappedVal('lastName', row);
                                return (
                                  <tr key={idx} className="hover:bg-zinc-900/10">
                                    <td className="py-1.5 text-zinc-350 truncate max-w-[100px]">{biz || '—'}</td>
                                    <td className="py-1.5 text-zinc-450 truncate max-w-[100px]">{email || '—'}</td>
                                    <td className="py-1.5 text-zinc-350 truncate max-w-[100px]">{fn || ln ? `${fn} ${ln}` : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>

                  </div>

                  {/* Actions */}
                  <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                    <button
                      disabled={importingLeads}
                      onClick={() => setImportStep(1)}
                      className="text-zinc-500 hover:text-zinc-300 text-xs font-semibold"
                    >
                      Upload different file
                    </button>
                    <button
                      disabled={importingLeads}
                      onClick={handleRunImport}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
                    >
                      {importingLeads ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Importing {csvRows.length} Leads...</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Import {csvRows.length} Leads</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Progress & Results */}
              {importStep === 3 && (
                <div className="text-center py-8 space-y-4 animate-in fade-in duration-300">
                  <div className="h-12 w-12 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Check className="h-6 w-6" />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-200">Import Completed Successfully</h4>
                  
                  <div className="max-w-xs mx-auto grid grid-cols-2 gap-4 py-2">
                    <div className="bg-zinc-950/40 border border-zinc-900 p-4 rounded-xl">
                      <div className="text-xs text-zinc-550">Leads Imported</div>
                      <div className="text-xl font-bold text-zinc-200 mt-1">{importSummary.importedCount}</div>
                    </div>
                    <div className="bg-zinc-950/40 border border-zinc-900 p-4 rounded-xl">
                      <div className="text-xs text-zinc-550">Duplicates Skipped</div>
                      <div className="text-xl font-bold text-zinc-400 mt-1">{importSummary.skippedCount}</div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500">All leads were passed through contact policies and deduplication rules.</p>
                  
                  <div className="pt-4">
                    <button
                      onClick={() => setShowImportWizard(false)}
                      className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {showCreateLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg border border-zinc-800 bg-[#09090b] rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-zinc-150">Create New Lead</h3>
              </div>
              <button 
                onClick={() => setShowCreateLeadModal(false)}
                className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateLead} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
                {leadFormError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-450 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{leadFormError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">First Name</label>
                    <input
                      type="text"
                      value={newLeadData.firstName}
                      onChange={e => setNewLeadData({ ...newLeadData, firstName: e.target.value })}
                      placeholder="e.g. John"
                      className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Last Name</label>
                    <input
                      type="text"
                      value={newLeadData.lastName}
                      onChange={e => setNewLeadData({ ...newLeadData, lastName: e.target.value })}
                      placeholder="e.g. Doe"
                      className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Business Name</label>
                  <input
                    type="text"
                    value={newLeadData.businessName}
                    onChange={e => setNewLeadData({ ...newLeadData, businessName: e.target.value })}
                    placeholder="e.g. Doe Marketing Co"
                    className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={newLeadData.email}
                    onChange={e => setNewLeadData({ ...newLeadData, email: e.target.value })}
                    placeholder="e.g. john@example.com"
                    className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Website URL</label>
                  <input
                    type="text"
                    value={newLeadData.website}
                    onChange={e => setNewLeadData({ ...newLeadData, website: e.target.value })}
                    placeholder="e.g. https://example.com"
                    className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Phone</label>
                    <input
                      type="text"
                      value={newLeadData.phone}
                      onChange={e => setNewLeadData({ ...newLeadData, phone: e.target.value })}
                      placeholder="e.g. +61 400 000 000"
                      className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Suburb</label>
                    <input
                      type="text"
                      value={newLeadData.suburb}
                      onChange={e => setNewLeadData({ ...newLeadData, suburb: e.target.value })}
                      placeholder="e.g. Sydney"
                      className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 px-3.5 py-2.5 text-sm transition-all text-zinc-100 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-zinc-800 bg-[#09090b]/40 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateLeadModal(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/20 hover:bg-zinc-900/50 px-4 py-2.5 text-sm font-semibold transition-all text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLead}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingLead ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Lead</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading leads module...
      </div>
    }>
      <LeadsContent />
    </Suspense>
  );
}
