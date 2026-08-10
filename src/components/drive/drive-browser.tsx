'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  createFolder,
  DriveApiError,
  listItems,
  moveItem,
  normalizeDriveItems,
  permanentlyDeleteItem,
  readPreviewText,
  renameItem,
  restoreItem,
  searchItems,
  trashItem,
  updateItem,
  uploadFile,
} from './drive-api';
import type { DriveBreadcrumb, DriveItem } from './drive-types';
import { DriveIcon } from './drive-icons';
import { formatFileSize, formatUpdatedAt, getErrorMessage } from './drive-utils';
import { LoginForm } from './login-form';
import { drivePublicPath } from '@/lib/config/drive-public-path';

type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'error';
type BrowserView = 'drive' | 'recent' | 'starred' | 'trash';
type ViewMode = 'list' | 'grid';
type FilterType = 'all' | 'folder' | 'file';
type ModifiedFilter = 'any' | 'today' | 'week' | 'month';
type SortKey = 'name' | 'updated' | 'size' | 'type';

type DialogState =
  | { kind: 'folder' }
  | { kind: 'rename'; item: DriveItem }
  | { kind: 'move'; item: DriveItem }
  | { kind: 'bulk-move'; ids: string[] }
  | { kind: 'confirm'; item: DriveItem; action: 'trash' | 'permanent' }
  | { kind: 'bulk-confirm'; ids: string[]; action: 'trash' | 'permanent' };

type PreviewState = { item: DriveItem; text: string | null; error: string | null };

function isAuthError(error: unknown) {
  return error instanceof DriveApiError && (error.status === 401 || error.status === 403);
}

function initialBreadcrumb(view: BrowserView): DriveBreadcrumb[] {
  return [{ id: null, name: view === 'trash' ? 'Trash' : 'My Drive' }];
}

function viewTitle(view: BrowserView) {
  if (view === 'recent') return 'Recent';
  if (view === 'starred') return 'Starred';
  if (view === 'trash') return 'Trash';
  return 'My Drive';
}

function fileLabel(item: DriveItem) {
  if (item.kind === 'folder') return 'Folder';
  if (item.mimeType === 'application/pdf') return 'PDF';
  if (item.mimeType?.includes('spreadsheet')) return 'Spreadsheet';
  if (item.mimeType?.includes('document')) return 'Document';
  if (item.mimeType?.startsWith('image/')) return 'Image';
  if (item.mimeType?.startsWith('video/')) return 'Video';
  if (item.mimeType?.startsWith('audio/')) return 'Audio';
  const extension = item.name.split('.').pop();
  return extension && extension !== item.name ? extension.toUpperCase() : 'File';
}

function compareItems(left: DriveItem, right: DriveItem, sortKey: SortKey) {
  if (sortKey === 'name') return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  if (sortKey === 'type') return fileLabel(left).localeCompare(fileLabel(right), undefined, { sensitivity: 'base' });
  if (sortKey === 'size') return (left.size ?? -1) - (right.size ?? -1);
  return (left.updatedAt ? Date.parse(left.updatedAt) : 0) - (right.updatedAt ? Date.parse(right.updatedAt) : 0);
}

function sortItems(items: DriveItem[], sortKey: SortKey, direction: 'asc' | 'desc') {
  return [...items].sort((left, right) => {
    const difference = compareItems(left, right, sortKey);
    if (difference !== 0) return direction === 'asc' ? difference : -difference;
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function DriveBrowser() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [view, setView] = useState<BrowserView>('drive');
  const [parentId, setParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveBreadcrumb[]>(initialBreadcrumb('drive'));
  const [items, setItems] = useState<DriveItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [modifiedFilter, setModifiedFilter] = useState<ModifiedFilter>('any');
  const [locationFilter, setLocationFilter] = useState<'all' | 'current'>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const isTrash = view === 'trash';
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const hasFilters = filterType !== 'all' || modifiedFilter !== 'any' || locationFilter !== 'all' || starredOnly;
  const isSearching = Boolean(activeSearch || hasFilters || view === 'recent' || view === 'starred');

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const shouldSearch = Boolean(activeSearch || hasFilters || view === 'recent' || view === 'starred');
      const modifiedAfter = modifiedFilter === 'any'
        ? undefined
        : new Date(Date.now() - (modifiedFilter === 'today' ? 24 : modifiedFilter === 'week' ? 24 * 7 : 24 * 30) * 60 * 60 * 1000);
      const payload = shouldSearch
        ? await searchItems(activeSearch, {
            includeTrash: isTrash,
            starred: view === 'starred' || starredOnly ? true : undefined,
            kind: filterType === 'all' ? undefined : filterType,
            parentId: locationFilter === 'current' ? parentId : undefined,
            modifiedAfter,
            sort: view === 'recent' ? 'updatedAt' : sortKey === 'updated' ? 'updatedAt' : sortKey === 'type' ? 'kind' : sortKey,
            direction: view === 'recent' ? 'desc' : sortDirection,
          })
        : await listItems(parentId, isTrash);
      setItems(sortItems(normalizeDriveItems(payload), sortKey, sortDirection));
      setAuthState('signed-in');
      setError(null);
    } catch (loadError) {
      if (isAuthError(loadError)) {
        setAuthState('signed-out');
        setError(null);
      } else {
        setError(getErrorMessage(loadError, 'Drive items could not be loaded.'));
        setAuthState((current) => (current === 'checking' ? 'error' : current));
      }
    } finally {
      setLoading(false);
    }
  }, [activeSearch, filterType, hasFilters, isTrash, locationFilter, modifiedFilter, parentId, sortDirection, sortKey, starredOnly, view]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareState = params.get('share');
    const sharedState = params.get('shared');
    const uploaded = Number(params.get('uploaded')) || 0;
    const failed = Number(params.get('failed')) || 0;

    if (shareState === 'signin') {
      setShareNotice('Sign in before sharing files with Drive.');
    } else if (sharedState === 'success') {
      setStatusMessage(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded from Share.`);
    } else if (sharedState === 'partial') {
      setStatusMessage(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded from Share.`);
      setShareNotice(`${failed} ${failed === 1 ? 'shared file was' : 'shared files were'} not uploaded.`);
    } else if (sharedState === 'empty') {
      setShareNotice('No files were received from the share.');
    } else if (sharedState === 'error') {
      setShareNotice('Drive could not upload the shared files. Try again.');
    }

    if (shareState || sharedState) {
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyAction) closeDialog();
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [busyAction, dialog]);

  useEffect(() => {
    if (!preview) return undefined;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [preview]);

  function handleAuthSuccess() {
    setAuthState('signed-in');
    setError(null);
    setShareNotice(null);
    setStatusMessage('Signed in successfully.');
    void loadItems();
  }

  function resetSearch() {
    setSearchTerm('');
    setActiveSearch('');
  }

  function clearFilters() {
    setFilterType('all');
    setModifiedFilter('any');
    setLocationFilter('all');
    setStarredOnly(false);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(searchTerm.trim());
    setSelectedIds(new Set());
  }

  function selectView(nextView: BrowserView) {
    setView(nextView);
    setParentId(null);
    setBreadcrumbs(initialBreadcrumb(nextView));
    resetSearch();
    clearFilters();
    setSelectedIds(new Set());
    setStatusMessage(null);
    setSidebarOpen(false);
  }

  function navigateToBreadcrumb(index: number) {
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setParentId(nextBreadcrumbs[nextBreadcrumbs.length - 1]?.id ?? null);
    setView('drive');
    resetSearch();
    setSelectedIds(new Set());
  }

  function openFolder(item: DriveItem) {
    if (item.kind !== 'folder' || isTrash) return;
    setView('drive');
    setParentId(item.id);
    setBreadcrumbs((current) => [...current, { id: item.id, name: item.name }]);
    resetSearch();
    setSelectedIds(new Set());
    setStatusMessage(null);
  }

  async function openPreview(item: DriveItem) {
    if (item.kind !== 'file' || item.trashed) return;
    setPreview({ item, text: null, error: null });
    if (!isTextPreview(item)) return;
    try {
      const text = await readPreviewText(item.id);
      setPreview((current) => current?.item.id === item.id ? { ...current, text } : current);
    } catch (previewError) {
      setPreview((current) => current?.item.id === item.id ? { ...current, error: getErrorMessage(previewError, 'This text preview could not be loaded.') } : current);
    }
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => current.size === items.length ? new Set() : new Set(items.map((item) => item.id)));
  }

  function openFolderDialog() {
    setDialog({ kind: 'folder' });
    setDialogValue('');
    setDialogError(null);
  }

  function openRenameDialog(item: DriveItem) {
    setDialog({ kind: 'rename', item });
    setDialogValue(item.name);
    setDialogError(null);
  }

  function openMoveDialog(item: DriveItem) {
    setDialog({ kind: 'move', item });
    setDialogValue(parentId ?? '');
    setDialogError(null);
  }

  function openBulkMoveDialog() {
    setDialog({ kind: 'bulk-move', ids: [...selectedIds] });
    setDialogValue(parentId ?? '');
    setDialogError(null);
  }

  function openConfirmDialog(item: DriveItem, action: 'trash' | 'permanent') {
    setDialog({ kind: 'confirm', item, action });
    setDialogValue('');
    setDialogError(null);
  }

  function openBulkConfirmDialog(action: 'trash' | 'permanent') {
    setDialog({ kind: 'bulk-confirm', ids: [...selectedIds], action });
    setDialogValue('');
    setDialogError(null);
  }

  function closeDialog() {
    if (busyAction) return;
    setDialog(null);
    setDialogValue('');
    setDialogError(null);
  }

  function handleMutationError(mutationError: unknown) {
    if (isAuthError(mutationError)) {
      setAuthState('signed-out');
      setError('Your Drive session expired. Sign in again to continue.');
    } else {
      setError(getErrorMessage(mutationError));
    }
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusyAction('upload');
    setError(null);
    setShareNotice(null);
    setStatusMessage(null);
    let uploaded = 0;
    let failed = 0;
    let firstError: unknown;
    try {
      for (const file of files) {
        try {
          await uploadFile(file, parentId);
          uploaded += 1;
        } catch (uploadError) {
          failed += 1;
          firstError ??= uploadError;
          if (isAuthError(uploadError)) break;
        }
      }

      if (firstError && isAuthError(firstError)) {
        handleMutationError(firstError);
      } else if (failed > 0) {
        if (uploaded > 0) setStatusMessage(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded.`);
        setError(`${failed} ${failed === 1 ? 'file could not' : 'files could'} be uploaded.`);
      } else {
        setStatusMessage(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded.`);
      }

      if (uploaded > 0) await loadItems();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore(item: DriveItem) {
    setBusyAction(`restore-${item.id}`);
    setError(null);
    setStatusMessage(null);
    try {
      await restoreItem(item.id);
      setStatusMessage(`${item.name} restored.`);
      await loadItems();
    } catch (restoreError) {
      handleMutationError(restoreError);
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleStar(item: DriveItem) {
    const nextStarred = !item.starred;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, starred: nextStarred } : candidate));
    try {
      await updateItem(item.id, { starred: nextStarred });
      setStatusMessage(nextStarred ? `${item.name} added to Starred.` : `${item.name} removed from Starred.`);
      if (view === 'starred' && !nextStarred) await loadItems();
    } catch (starError) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, starred: item.starred } : candidate));
      handleMutationError(starError);
    }
  }

  async function runBulkMutation(action: 'star' | 'unstar' | 'trash' | 'restore' | 'permanent' | 'move', destination?: string | null) {
    const targets = [...selectedItems];
    if (!targets.length) return;
    setBusyAction('bulk');
    setError(null);
    setStatusMessage(null);
    const results = await Promise.allSettled(targets.map((item) => {
      if (action === 'star' || action === 'unstar') return updateItem(item.id, { starred: action === 'star' });
      if (action === 'trash') return trashItem(item.id);
      if (action === 'restore') return restoreItem(item.id);
      if (action === 'permanent') return permanentlyDeleteItem(item.id);
      return moveItem(item.id, destination ?? null);
    }));
    const failed = results.filter((result) => result.status === 'rejected');
    setSelectedIds(new Set());
    setStatusMessage(failed.length ? `${targets.length - failed.length} items updated; ${failed.length} failed.` : `${targets.length} items updated.`);
    if (failed.length) setError('Some selected items could not be updated. Review the list and try again.');
    await loadItems();
    setBusyAction(null);
  }

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const value = dialogValue.trim();
    if ((dialog.kind === 'folder' || dialog.kind === 'rename') && !value) {
      setDialogError(dialog.kind === 'folder' ? 'Enter a name for this folder.' : 'Enter a new name.');
      return;
    }
    if ((dialog.kind === 'move' || dialog.kind === 'bulk-move') && value === (dialog.kind === 'move' ? dialog.item.parentId : parentId)) {
      setDialogError('Choose a different destination folder.');
      return;
    }
    const actionId = dialog.kind === 'folder' ? 'folder-new' : `dialog-${Date.now()}`;
    setBusyAction(actionId);
    setDialogError(null);
    setError(null);
    setStatusMessage(null);
    try {
      if (dialog.kind === 'folder') {
        await createFolder(value, parentId);
        setStatusMessage(`${value} created.`);
      } else if (dialog.kind === 'rename') {
        await renameItem(dialog.item.id, value);
        setStatusMessage(`${dialog.item.name} renamed.`);
      } else if (dialog.kind === 'move') {
        await moveItem(dialog.item.id, value || null);
        setStatusMessage(`${dialog.item.name} moved.`);
      } else if (dialog.kind === 'bulk-move') {
        setBusyAction('bulk');
        await runBulkMutation('move', value || null);
        closeDialog();
        return;
      } else if (dialog.kind === 'confirm') {
        if (dialog.action === 'trash') await trashItem(dialog.item.id);
        else await permanentlyDeleteItem(dialog.item.id);
        setStatusMessage(dialog.action === 'trash' ? `${dialog.item.name} moved to Trash.` : `${dialog.item.name} permanently deleted.`);
      } else {
        setBusyAction('bulk');
        const targets = items.filter((item) => dialog.ids.includes(item.id));
        const results = await Promise.allSettled(targets.map((item) => dialog.action === 'trash' ? trashItem(item.id) : permanentlyDeleteItem(item.id)));
        const failed = results.filter((result) => result.status === 'rejected').length;
        setSelectedIds(new Set());
        setStatusMessage(failed ? `${targets.length - failed} items updated; ${failed} failed.` : `${targets.length} items updated.`);
      }
      setDialog(null);
      setDialogValue('');
      await loadItems();
    } catch (mutationError) {
      handleMutationError(mutationError);
    } finally {
      setBusyAction(null);
    }
  }

  if (authState === 'checking') return <LoadingScreen label="Checking your Drive session…" />;

  if (authState === 'signed-out') {
    return (
      <main className="login-page">
        <div className="login-card">
          <a className="brand brand-centered" href={drivePublicPath('/')}><span aria-hidden="true" className="brand-mark">D</span><span>Drive</span></a>
          <p className="eyebrow">Private storage</p>
          <h1>Sign in to Drive</h1>
          <p className="login-intro">Enter the API token for this private Drive service to browse your files.</p>
          {(error ?? shareNotice) ? <p aria-live="polite" className="form-error" role="alert">{error ?? shareNotice}</p> : null}
          <LoginForm onSuccess={handleAuthSuccess} />
          <p className="login-footer"><a href={drivePublicPath('/login')}>Open the dedicated sign-in page</a></p>
        </div>
      </main>
    );
  }

  if (authState === 'error') {
    return (
      <main className="login-page">
        <div className="login-card">
          <a className="brand brand-centered" href={drivePublicPath('/')}><span aria-hidden="true" className="brand-mark">D</span><span>Drive</span></a>
          <p className="eyebrow">Private storage</p>
          <h1>Drive is unavailable</h1>
          <p className="login-intro">Drive could not be reached while checking your session.</p>
          {error ? <p aria-live="polite" className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-full" onClick={() => { setAuthState('checking'); setError(null); void loadItems(); }} type="button">Try again</button>
        </div>
      </main>
    );
  }

  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div className={`drive-app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="drive-topbar">
        <button aria-controls="drive-navigation" aria-expanded={sidebarOpen} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} className={`icon-button topbar-menu ${sidebarOpen ? 'topbar-menu-active' : ''}`} onClick={() => setSidebarOpen((current) => !current)} type="button"><DriveIcon name={sidebarOpen ? 'close' : 'menu'} size={22} /></button>
        <a className="brand topbar-brand" href={drivePublicPath('/')}><span aria-hidden="true" className="brand-mark">D</span><span>Drive</span></a>
        <form className="search-shell" onSubmit={handleSearchSubmit} role="search">
          <DriveIcon name="search" size={21} />
          <label className="sr-only" htmlFor="drive-search">Search files and folders</label>
          <input id="drive-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search in Drive" type="search" value={searchTerm} />
          {searchTerm ? <button aria-label="Clear search" className="search-clear" onClick={resetSearch} type="button"><DriveIcon name="close" size={17} /></button> : null}
          <button aria-label="Search" className="search-submit" type="submit"><DriveIcon name="arrow-down" size={17} /></button>
        </form>
        <div className="header-actions">
          <button aria-label="Drive suggestions" className="header-action" type="button"><DriveIcon name="sparkle" /></button>
          <button aria-label="Account" className="header-action avatar" type="button">E</button>
        </div>
      </header>

      <div aria-hidden={!sidebarOpen} className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />
      <div className="drive-layout">
        <aside aria-label="Drive navigation" className="drive-sidebar" id="drive-navigation">
          <button className="new-button" disabled={busyAction !== null} onClick={openFolderDialog} type="button"><DriveIcon name="plus" size={21} />New</button>
          <nav className="sidebar-nav">
            <button className={`sidebar-link ${view === 'drive' ? 'sidebar-link-active' : ''}`} onClick={() => selectView('drive')} type="button"><DriveIcon name="home" />My Drive</button>
            <button className={`sidebar-link ${view === 'recent' ? 'sidebar-link-active' : ''}`} onClick={() => selectView('recent')} type="button"><DriveIcon name="clock" />Recent</button>
            <button className={`sidebar-link ${view === 'starred' ? 'sidebar-link-active' : ''}`} onClick={() => selectView('starred')} type="button"><DriveIcon name="star" />Starred</button>
            <button className={`sidebar-link ${view === 'trash' ? 'sidebar-link-active' : ''}`} onClick={() => selectView('trash')} type="button"><DriveIcon name="trash" />Trash</button>
            <p className="sidebar-nav-section">Workspace</p>
            <button className="sidebar-link" onClick={() => { setStatusMessage('Sharing is available for a future Drive connection.'); setSidebarOpen(false); }} type="button"><DriveIcon name="share" />Shared</button>
            <a className="sidebar-link sidebar-footer-link" href={drivePublicPath('/login')}><DriveIcon name="settings" />Settings</a>
          </nav>
          <div className="storage-card">
            <p className="storage-label"><DriveIcon name="archive" size={17} />Storage</p>
            <div aria-label="Storage used: 22 percent" className="storage-track"><div className="storage-fill" /></div>
            <p className="storage-copy">Storage usage is managed by the private server.</p>
          </div>
          <div className="sidebar-footer"><a className="sidebar-footer-link" href={drivePublicPath('/login')}>Session active · Sign in again</a></div>
        </aside>

        <main className="drive-content">
          <div className="content-inner">
            <div className="page-header">
              <div><p className="eyebrow">Private storage</p><h1>{viewTitle(view)}</h1></div>
              <div aria-live="polite" className="heading-summary"><span className="summary-dot" />{items.length} {items.length === 1 ? 'item' : 'items'}</div>
            </div>

            <section aria-labelledby="drive-heading" className="drive-panel">
              <h2 className="sr-only" id="drive-heading">{viewTitle(view)} files and folders</h2>
              <div className="breadcrumb-row">
                <nav aria-label="Breadcrumb" className="breadcrumbs">
                  {breadcrumbs.map((breadcrumb, index) => <span className="breadcrumb-segment" key={`${breadcrumb.id ?? 'root'}-${index}`}>
                    {index > 0 ? <span aria-hidden="true" className="breadcrumb-divider"><DriveIcon name="chevron-right" size={15} /></span> : null}
                    <button className={index === breadcrumbs.length - 1 ? 'breadcrumb-current' : ''} onClick={() => navigateToBreadcrumb(index)} type="button">{breadcrumb.name}</button>
                  </span>)}
                </nav>
                <span className="current-location"><DriveIcon name="archive" size={15} />Private Drive</span>
              </div>

              <div className="filter-bar">
                <button aria-expanded={filterOpen} className={`filter-button ${filterOpen || hasFilters ? 'filter-button-active' : ''}`} onClick={() => setFilterOpen((current) => !current)} type="button"><DriveIcon name="settings" size={16} />Filters{hasFilters ? ` · ${[filterType !== 'all', modifiedFilter !== 'any', locationFilter !== 'all', starredOnly].filter(Boolean).length}` : ''}</button>
                {activeSearch ? <span className="filter-chip">“{activeSearch}” <button aria-label="Remove search" onClick={resetSearch} type="button"><DriveIcon name="close" size={13} /></button></span> : null}
                {view === 'starred' ? <span className="filter-chip"><DriveIcon name="star" size={13} />Starred</span> : null}
                {filterType !== 'all' ? <span className="filter-chip">{filterType === 'file' ? 'Files' : 'Folders'} <button aria-label="Clear type filter" onClick={() => setFilterType('all')} type="button"><DriveIcon name="close" size={13} /></button></span> : null}
                <span className="filter-spacer" />
                <label className="sr-only" htmlFor="sort-items">Sort items</label>
                <select aria-label="Sort items" className="sort-select" id="sort-items" onChange={(event) => { const [nextKey, nextDirection] = event.target.value.split('-') as [SortKey, 'asc' | 'desc']; setSortKey(nextKey); setSortDirection(nextDirection); }} value={`${sortKey}-${sortDirection}`}>
                  <option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="updated-desc">Last modified</option><option value="updated-asc">Oldest modified</option><option value="size-desc">Largest first</option><option value="type-asc">Type</option>
                </select>
                <div aria-label="View mode" className="view-toggle">
                  <button aria-label="List view" className={viewMode === 'list' ? 'view-toggle-active' : ''} onClick={() => setViewMode('list')} type="button"><DriveIcon name="view-list" size={17} /></button>
                  <button aria-label="Grid view" className={viewMode === 'grid' ? 'view-toggle-active' : ''} onClick={() => setViewMode('grid')} type="button"><DriveIcon name="grid" size={17} /></button>
                </div>
              </div>

              {filterOpen ? <div className="filter-panel">
                <div className="filter-group"><label htmlFor="filter-type">Type</label><select id="filter-type" onChange={(event) => setFilterType(event.target.value as FilterType)} value={filterType}><option value="all">All items</option><option value="file">Files only</option><option value="folder">Folders only</option></select></div>
                <div className="filter-group"><label htmlFor="filter-modified">Modified</label><select id="filter-modified" onChange={(event) => setModifiedFilter(event.target.value as ModifiedFilter)} value={modifiedFilter}><option value="any">Any time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select></div>
                <div className="filter-group"><label htmlFor="filter-location">Location</label><select id="filter-location" onChange={(event) => setLocationFilter(event.target.value as 'all' | 'current')} value={locationFilter}><option value="all">Anywhere in Drive</option><option value="current">Current folder</option></select></div>
                <div className="filter-group"><label htmlFor="filter-starred">Organization</label><select id="filter-starred" onChange={(event) => setStarredOnly(event.target.value === 'starred')} value={starredOnly ? 'starred' : 'all'}><option value="all">All items</option><option value="starred">Starred only</option></select></div>
                <div className="filter-group"><span className="sr-only">Clear filters</span><button className="button button-quiet" onClick={clearFilters} type="button">Clear filters</button></div>
              </div> : null}

              {selectedCount > 0 ? <div className="action-row selection-toolbar">
                <div className="action-row-left"><p className="selection-count">{selectedCount} selected</p>
                  {!isTrash ? <><button className="button button-secondary" disabled={busyAction !== null} onClick={() => void runBulkMutation('star')} type="button"><DriveIcon name="star" size={16} />Star</button><button className="button button-secondary" disabled={busyAction !== null} onClick={() => void runBulkMutation('unstar')} type="button">Unstar</button><button className="button button-secondary" disabled={busyAction !== null} onClick={openBulkMoveDialog} type="button"><DriveIcon name="folder" size={16} />Move</button><button className="button button-danger" disabled={busyAction !== null} onClick={() => openBulkConfirmDialog('trash')} type="button"><DriveIcon name="trash" size={16} />Trash</button></> : <><button className="button button-secondary" disabled={busyAction !== null} onClick={() => void runBulkMutation('restore')} type="button">Restore</button><button className="button button-danger" disabled={busyAction !== null} onClick={() => openBulkConfirmDialog('permanent')} type="button">Delete forever</button></>}
                </div><button className="button button-quiet" onClick={() => setSelectedIds(new Set())} type="button">Clear selection</button>
              </div> : <div className="action-row"><div className="action-row-left">{!isTrash ? <><input className="sr-only" id="drive-upload" multiple onChange={handleUploadChange} ref={fileInputRef} type="file" /><button className="button button-primary" disabled={busyAction !== null} onClick={() => fileInputRef.current?.click()} type="button"><DriveIcon name="upload" size={16} />{busyAction === 'upload' ? 'Uploading…' : 'Upload file'}</button><button className="button button-secondary" disabled={busyAction !== null} onClick={openFolderDialog} type="button"><DriveIcon name="plus" size={16} />New folder</button></> : <p className="toolbar-hint">Items in Trash can be restored or permanently deleted.</p>}</div>{isSearching ? <p className="toolbar-hint">{activeSearch ? <>Results for <strong>“{activeSearch}”</strong></> : view === 'recent' ? 'Recently modified items' : view === 'starred' ? 'Your starred items' : 'Filtered items'}</p> : null}</div>}

              {statusMessage ? <p aria-live="polite" className="status-message" role="status">{statusMessage}</p> : null}
              {(error ?? shareNotice) ? <p aria-live="assertive" className="form-error page-error" role="alert">{error ?? shareNotice}</p> : null}

              {viewMode === 'list' ? <div aria-busy={loading} className="table-wrap"><table className="item-table"><caption className="sr-only">{viewTitle(view)} files and folders</caption><thead><tr><th scope="col"><label className="sr-only" htmlFor="select-all">Select all items</label><input aria-label="Select all items" checked={allSelected} className="item-check" id="select-all" onChange={toggleSelectAll} type="checkbox" /></th><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{loading ? <tr><td className="table-message" colSpan={5}>Loading items…</td></tr> : items.length === 0 ? <tr><td className="table-message" colSpan={5}><EmptyState isTrash={isTrash} isSearching={isSearching} /></td></tr> : items.map((item) => <DriveItemRow disabled={busyAction !== null} isSelected={selectedIds.has(item.id)} isTrash={isTrash} item={item} key={item.id} onMove={openMoveDialog} onOpenFile={openPreview} onOpenFolder={openFolder} onPermanentDelete={(candidate) => openConfirmDialog(candidate, 'permanent')} onRename={openRenameDialog} onRestore={handleRestore} onSelect={toggleSelected} onStar={toggleStar} onTrash={(candidate) => openConfirmDialog(candidate, 'trash')} />)}</tbody></table></div> : <div aria-busy={loading} className="grid-wrap">{loading ? <div className="table-message">Loading items…</div> : items.length === 0 ? <div className="table-message"><EmptyState isTrash={isTrash} isSearching={isSearching} /></div> : items.map((item) => <DriveItemCard disabled={busyAction !== null} isSelected={selectedIds.has(item.id)} isTrash={isTrash} item={item} key={item.id} onMove={openMoveDialog} onOpenFile={openPreview} onOpenFolder={openFolder} onPermanentDelete={(candidate) => openConfirmDialog(candidate, 'permanent')} onRename={openRenameDialog} onRestore={handleRestore} onSelect={toggleSelected} onStar={toggleStar} onTrash={(candidate) => openConfirmDialog(candidate, 'trash')} />)}</div>}
            </section>
          </div>
        </main>
      </div>

      {dialog ? <DriveDialog busyAction={busyAction} dialog={dialog} dialogError={dialogError} dialogValue={dialogValue} onChange={setDialogValue} onClose={closeDialog} onSubmit={handleDialogSubmit} /> : null}
      {preview ? <DrivePreview preview={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

type ItemInteractionProps = {
  disabled: boolean;
  isSelected: boolean;
  isTrash: boolean;
  item: DriveItem;
  onMove: (item: DriveItem) => void;
  onOpenFile: (item: DriveItem) => void;
  onOpenFolder: (item: DriveItem) => void;
  onPermanentDelete: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  onRestore: (item: DriveItem) => void;
  onSelect: (itemId: string) => void;
  onStar: (item: DriveItem) => void;
  onTrash: (item: DriveItem) => void;
};

type ItemActionProps = Pick<ItemInteractionProps, 'disabled' | 'isTrash' | 'item' | 'onMove' | 'onPermanentDelete' | 'onRename' | 'onRestore' | 'onTrash'>;

function ItemActionButtons({ disabled, isTrash, item, onMove, onPermanentDelete, onRename, onRestore, onTrash }: ItemActionProps) {
  if (isTrash) return <><button className="action-link" disabled={disabled} onClick={() => void onRestore(item)} type="button">Restore</button><button className="action-link action-link-danger" disabled={disabled} onClick={() => onPermanentDelete(item)} type="button">Delete forever</button></>;
  return <><button className="action-link" disabled={disabled} onClick={() => onRename(item)} type="button">Rename</button><button className="action-link" disabled={disabled} onClick={() => onMove(item)} type="button">Move</button><button className="action-link action-link-danger" disabled={disabled} onClick={() => onTrash(item)} type="button">Trash</button></>;
}

function ItemDownloadAction({ isTrash, item }: Pick<ItemActionProps, 'isTrash' | 'item'>) {
  if (isTrash || item.kind !== 'file') return null;
  return <a className="action-link" download href={drivePublicPath(`/api/drive/items/${encodeURIComponent(item.id)}/download`)}>Download</a>;
}

function ItemActions(props: ItemActionProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      if (!(event.target instanceof Node) || !menu.contains(event.target)) menu.open = false;
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return <><div className="item-actions-inline"><ItemDownloadAction {...props} /><ItemActionButtons {...props} /></div><details className="item-actions-menu" ref={menuRef}><summary aria-label={`Actions for ${props.item.name}`} className="action-menu-trigger"><DriveIcon name="more" size={18} /></summary><div className="action-menu-popover"><ItemDownloadAction {...props} /><ItemActionButtons {...props} /></div></details></>;
}

function ItemGlyph({ item }: { item: DriveItem }) {
  return <span aria-hidden="true" className={`item-glyph ${item.kind === 'file' ? 'item-glyph-file' : ''}`}><DriveIcon name={item.kind === 'folder' ? 'folder' : 'file'} size={19} /></span>;
}

function ItemName({ item, onOpenFile, onOpenFolder }: { item: DriveItem; onOpenFile: (item: DriveItem) => void; onOpenFolder: (item: DriveItem) => void }) {
  return <div className="item-copy">{item.kind === 'folder' && !item.trashed ? <button className="item-name-link" onClick={() => onOpenFolder(item)} type="button">{item.name}</button> : item.kind === 'file' && !item.trashed ? <button className="item-name-link" onClick={() => void onOpenFile(item)} type="button">{item.name}</button> : <span className="item-name-text">{item.name}</span>}<span className="item-subline">{item.kind === 'folder' ? 'Folder' : fileLabel(item)}{item.trashed ? ' · In Trash' : ''}</span></div>;
}

function DriveItemRow({ disabled, isSelected, isTrash, item, onMove, onOpenFile, onOpenFolder, onPermanentDelete, onRename, onRestore, onSelect, onStar, onTrash }: ItemInteractionProps) {
  return <tr className={isSelected ? 'item-row-selected' : ''}><td><input aria-label={`Select ${item.name}`} checked={isSelected} className="item-check" disabled={disabled} onChange={() => onSelect(item.id)} type="checkbox" /></td><td><div className="item-name-cell"><ItemGlyph item={item} /><ItemName item={item} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} /><button aria-label={item.starred ? `Remove ${item.name} from Starred` : `Add ${item.name} to Starred`} className={`star-button ${item.starred ? 'star-button-starred' : ''}`} disabled={disabled || isTrash} onClick={() => void onStar(item)} type="button"><DriveIcon name="star" size={17} /></button></div></td><td>{fileLabel(item)}</td><td><span className="date-cell">{formatUpdatedAt(item.updatedAt)}</span>{item.kind === 'file' ? <span className="size-cell">{formatFileSize(item.size)}</span> : null}</td><td><div aria-label={`Actions for ${item.name}`} className="item-actions"><ItemActions disabled={disabled} isTrash={isTrash} item={item} onMove={onMove} onPermanentDelete={onPermanentDelete} onRename={onRename} onRestore={onRestore} onTrash={onTrash} /></div></td></tr>;
}

function DriveItemCard({ disabled, isSelected, isTrash, item, onMove, onOpenFile, onOpenFolder, onPermanentDelete, onRename, onRestore, onSelect, onStar, onTrash }: ItemInteractionProps) {
  return <article className={`grid-card ${isSelected ? 'grid-card-selected' : ''}`}><div className="grid-card-top"><ItemGlyph item={item} /><button aria-label={item.starred ? `Remove ${item.name} from Starred` : `Add ${item.name} to Starred`} className={`star-button ${item.starred ? 'star-button-starred' : ''}`} disabled={disabled || isTrash} onClick={() => void onStar(item)} type="button"><DriveIcon name="star" size={18} /></button></div><input aria-label={`Select ${item.name}`} checked={isSelected} className="item-check grid-card-check" disabled={disabled} onChange={() => onSelect(item.id)} type="checkbox" /><div className="grid-card-body"><ItemName item={item} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} /></div><div className="grid-card-footer"><DriveIcon name="clock" size={13} />{formatUpdatedAt(item.updatedAt)}{item.kind === 'file' ? ` · ${formatFileSize(item.size)}` : ''}</div><div className="grid-card-actions"><ItemActions disabled={disabled} isTrash={isTrash} item={item} onMove={onMove} onPermanentDelete={onPermanentDelete} onRename={onRename} onRestore={onRestore} onTrash={onTrash} /></div></article>;
}

function DriveDialog({ busyAction, dialog, dialogError, dialogValue, onChange, onClose, onSubmit }: { busyAction: string | null; dialog: DialogState; dialogError: string | null; dialogValue: string; onChange: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const isBulk = dialog.kind === 'bulk-move' || dialog.kind === 'bulk-confirm';
  const title = dialog.kind === 'folder' ? 'Create a folder' : dialog.kind === 'rename' ? 'Rename item' : dialog.kind === 'move' || dialog.kind === 'bulk-move' ? (isBulk ? 'Move selected items' : 'Move item') : dialog.action === 'trash' ? (isBulk ? 'Move selected items to Trash?' : 'Move to Trash?') : (isBulk ? 'Delete selected items permanently?' : 'Delete permanently?');
  const description = dialog.kind === 'folder' ? 'Create a new folder in the current location.' : dialog.kind === 'rename' ? `Choose a new name for ${dialog.item.name}.` : dialog.kind === 'move' || dialog.kind === 'bulk-move' ? 'Enter a destination folder ID. Leave it blank to move to My Drive.' : dialog.action === 'trash' ? (isBulk ? 'Selected items can be restored from Trash later.' : `${dialog.item.name} can be restored from Trash later.`) : (isBulk ? 'Selected items and their contents will be permanently removed.' : `${dialog.item.name} and its contents will be permanently removed. This cannot be undone.`);
  return <div className="dialog-backdrop"><section aria-describedby="drive-dialog-description" aria-labelledby="drive-dialog-title" aria-modal="true" className="dialog-card" role="dialog"><div className="dialog-header"><div><p className="eyebrow">Drive action</p><h2 id="drive-dialog-title">{title}</h2></div><button aria-label="Close dialog" className="dialog-close" onClick={onClose} type="button"><DriveIcon name="close" size={21} /></button></div><p className="dialog-description" id="drive-dialog-description">{description}</p><form className="dialog-form" onSubmit={onSubmit}>{dialog.kind === 'folder' ? <div className="field-group"><label htmlFor="dialog-folder-name">Folder name</label><input autoFocus id="dialog-folder-name" onChange={(event) => onChange(event.target.value)} placeholder="New folder" required value={dialogValue} /></div> : null}{dialog.kind === 'rename' ? <div className="field-group"><label htmlFor="dialog-item-name">New name</label><input autoFocus id="dialog-item-name" onChange={(event) => onChange(event.target.value)} required value={dialogValue} /></div> : null}{dialog.kind === 'move' || dialog.kind === 'bulk-move' ? <div className="field-group"><label htmlFor="dialog-parent-id">Destination folder ID</label><input autoFocus id="dialog-parent-id" onChange={(event) => onChange(event.target.value)} placeholder="Folder UUID, or blank for My Drive" value={dialogValue} /><p className="field-help">The current folder ID is pre-filled when available.</p></div> : null}{dialogError ? <p aria-live="polite" className="form-error" role="alert">{dialogError}</p> : null}<div className="dialog-actions"><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className={((dialog.kind === 'confirm' || dialog.kind === 'bulk-confirm') && dialog.action === 'permanent') ? 'button button-danger' : 'button button-primary'} disabled={busyAction !== null} type="submit">{busyAction ? 'Working…' : dialog.kind === 'folder' ? 'Create folder' : dialog.kind === 'rename' ? 'Rename' : dialog.kind === 'move' || dialog.kind === 'bulk-move' ? 'Move' : dialog.action === 'trash' ? 'Move to Trash' : 'Delete forever'}</button></div></form></section></div>;
}

function isTextPreview(item: DriveItem) {
  if (item.mimeType?.startsWith('text/')) return true;
  if (['application/json', 'application/javascript', 'application/xml', 'application/x-httpd-php'].includes(item.mimeType ?? '')) return true;
  return /\.(c|cc|cpp|css|h|hpp|html?|java|js|json|md|php|py|rb|sh|sql|svg|ts|tsx|xml|yaml|yml)$/i.test(item.name);
}

function previewKind(item: DriveItem): 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'unsupported' {
  if (isTextPreview(item)) return 'text';
  if (item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (item.mimeType?.startsWith('image/')) return 'image';
  if (item.mimeType?.startsWith('audio/')) return 'audio';
  if (item.mimeType?.startsWith('video/')) return 'video';
  return 'unsupported';
}

function DrivePreview({ preview, onClose }: { preview: PreviewState; onClose: () => void }) {
  const { item } = preview;
  const kind = previewKind(item);
  const fileUrl = drivePublicPath(`/api/drive/items/${encodeURIComponent(item.id)}/preview`);

  return <div aria-label="Close file preview" className="preview-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section aria-labelledby="preview-title" aria-modal="true" className="preview-card" role="dialog">
      <header className="preview-header"><div className="preview-heading"><p className="eyebrow">File preview</p><h2 id="preview-title">{item.name}</h2><span>{fileLabel(item)}{item.size !== null ? ` · ${formatFileSize(item.size)}` : ''}</span></div><button aria-label="Close preview" autoFocus className="dialog-close" onClick={onClose} type="button"><DriveIcon name="close" size={21} /></button></header>
      <div className="preview-content">
        {kind === 'text' ? preview.error ? <p className="form-error" role="alert">{preview.error}</p> : preview.text === null ? <div className="preview-loading"><span className="loading-spinner" />Loading preview…</div> : <pre className="preview-text">{preview.text}</pre> : null}
        {kind === 'image' ? <img alt={item.name} className="preview-image" src={fileUrl} /> : null}
        {kind === 'pdf' ? <iframe className="preview-frame" title={`Preview of ${item.name}`} src={fileUrl} /> : null}
        {kind === 'audio' ? <audio className="preview-audio" controls src={fileUrl}>Your browser cannot play this audio file.</audio> : null}
        {kind === 'video' ? <video className="preview-video" controls src={fileUrl}>Your browser cannot play this video file.</video> : null}
        {kind === 'unsupported' ? <div className="preview-unsupported"><DriveIcon name="file" size={38} /><strong>Preview unavailable</strong><span>This file type can’t be previewed here.</span><a className="button button-primary" download href={drivePublicPath(`/api/drive/items/${encodeURIComponent(item.id)}/download`)}>Download file</a></div> : null}
      </div>
    </section>
  </div>;
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-page"><div aria-live="polite" className="loading-card" role="status"><span className="loading-spinner" /><span>{label}</span></div></main>;
}

function EmptyState({ isTrash, isSearching }: { isTrash: boolean; isSearching: boolean }) {
  if (isSearching) return <div className="empty-state"><DriveIcon name="search" size={30} /><strong>No matching items</strong><span>Try a different search term or clear a filter.</span></div>;
  return <div className="empty-state"><DriveIcon className="empty-state-icon" name={isTrash ? 'trash' : 'folder'} size={34} /><strong>{isTrash ? 'Trash is empty' : 'This folder is empty'}</strong><span>{isTrash ? 'Deleted items will appear here.' : 'Upload a file or create a folder to get started.'}</span></div>;
}
