'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  createFolder,
  DriveApiError,
  listItems,
  moveItem,
  normalizeDriveItems,
  permanentlyDeleteItem,
  renameItem,
  restoreItem,
  searchItems,
  trashItem,
  uploadFile,
} from './drive-api';
import type { DriveBreadcrumb, DriveItem, DriveView } from './drive-types';
import { formatFileSize, formatUpdatedAt, getErrorMessage, sortDriveItems } from './drive-utils';
import { LoginForm } from './login-form';
import { drivePublicPath } from '@/lib/config/drive-public-path';

type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'error';

type DialogState =
  | { kind: 'folder' }
  | { kind: 'rename'; item: DriveItem }
  | { kind: 'move'; item: DriveItem }
  | { kind: 'confirm'; item: DriveItem; action: 'trash' | 'permanent' };

function isAuthError(error: unknown) {
  return error instanceof DriveApiError && (error.status === 401 || error.status === 403);
}

function initialBreadcrumb(view: DriveView): DriveBreadcrumb[] {
  return [{ id: null, name: view === 'trash' ? 'Trash' : 'My Drive' }];
}

export function DriveBrowser() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [view, setView] = useState<DriveView>('drive');
  const [parentId, setParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<DriveBreadcrumb[]>(initialBreadcrumb('drive'));
  const [items, setItems] = useState<DriveItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const payload = activeSearch
        ? await searchItems(activeSearch)
        : await listItems(parentId, view === 'trash');
      setItems(sortDriveItems(normalizeDriveItems(payload)));
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
  }, [activeSearch, parentId, view]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyAction) {
        setDialog(null);
        setDialogError(null);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [busyAction, dialog]);

  function handleAuthSuccess() {
    setAuthState('signed-in');
    setError(null);
    setStatusMessage('Signed in successfully.');
    void loadItems();
  }

  function resetSearch() {
    setSearchTerm('');
    setActiveSearch('');
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();

    if (query === activeSearch) {
      void loadItems();
    } else {
      setActiveSearch(query);
    }
  }

  function selectView(nextView: DriveView) {
    setView(nextView);
    setParentId(null);
    setBreadcrumbs(initialBreadcrumb(nextView));
    resetSearch();
    setStatusMessage(null);
  }

  function navigateToBreadcrumb(index: number) {
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setParentId(nextBreadcrumbs[nextBreadcrumbs.length - 1]?.id ?? null);
    resetSearch();
  }

  function openFolder(item: DriveItem) {
    if (item.kind !== 'folder' || view === 'trash') {
      return;
    }

    setView('drive');
    setParentId(item.id);
    setBreadcrumbs((current) => [...current, { id: item.id, name: item.name }]);
    resetSearch();
    setStatusMessage(null);
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

  function openConfirmDialog(item: DriveItem, action: 'trash' | 'permanent') {
    setDialog({ kind: 'confirm', item, action });
    setDialogValue('');
    setDialogError(null);
  }

  function closeDialog() {
    if (busyAction) {
      return;
    }

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
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setBusyAction('upload');
    setError(null);
    setStatusMessage(null);

    try {
      await uploadFile(file, parentId);
      setStatusMessage(`${file.name} uploaded.`);
      await loadItems();
    } catch (uploadError) {
      handleMutationError(uploadError);
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

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!dialog) {
      return;
    }

    const value = dialogValue.trim();

    if (dialog.kind !== 'confirm' && dialog.kind !== 'move' && !value) {
      setDialogError('Enter a name for this folder.');
      return;
    }

    if (dialog.kind === 'rename' && !value) {
      setDialogError('Enter a new name.');
      return;
    }

    if (dialog.kind === 'move' && value === dialog.item.parentId) {
      setDialogError('Choose a different destination folder.');
      return;
    }

    const actionId = dialog.kind === 'folder' ? 'folder-new' : `${dialog.kind}-${dialog.item.id}`;
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
      } else if (dialog.action === 'trash') {
        await trashItem(dialog.item.id);
        setStatusMessage(`${dialog.item.name} moved to Trash.`);
      } else {
        await permanentlyDeleteItem(dialog.item.id);
        setStatusMessage(`${dialog.item.name} permanently deleted.`);
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

  if (authState === 'checking') {
    return <LoadingScreen label="Checking your Drive session…" />;
  }

  if (authState === 'signed-out') {
    return (
      <main className="login-page">
        <div className="login-card">
          <a className="brand brand-centered" href={drivePublicPath('/')}>
            <span aria-hidden="true" className="brand-mark">
              D
            </span>
            <span>Drive</span>
          </a>
          <p className="eyebrow">Private storage</p>
          <h1>Sign in to Drive</h1>
          <p className="login-intro">
            Enter the API token for this private Drive service to browse your files.
          </p>
          {error ? (
            <p aria-live="polite" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <LoginForm onSuccess={handleAuthSuccess} />
          <p className="login-footer">
            <a href={drivePublicPath('/login')}>Open the dedicated sign-in page</a>
          </p>
        </div>
      </main>
    );
  }

  if (authState === 'error') {
    return (
      <main className="login-page">
        <div className="login-card">
          <a className="brand brand-centered" href={drivePublicPath('/')}>
            <span aria-hidden="true" className="brand-mark">
              D
            </span>
            <span>Drive</span>
          </a>
          <p className="eyebrow">Private storage</p>
          <h1>Drive is unavailable</h1>
          <p className="login-intro">Drive could not be reached while checking your session.</p>
          {error ? (
            <p aria-live="polite" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button-primary button-full"
            onClick={() => {
              setAuthState('checking');
              setError(null);
              void loadItems();
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const isTrash = view === 'trash';

  return (
    <div className="drive-app">
      <header className="drive-header">
        <a className="brand" href={drivePublicPath('/')}>
          <span aria-hidden="true" className="brand-mark">
            D
          </span>
          <span>Drive</span>
        </a>
        <nav aria-label="Drive views" className="view-nav">
          <button
            className={view === 'drive' ? 'view-tab view-tab-active' : 'view-tab'}
            onClick={() => selectView('drive')}
            type="button"
          >
            My Drive
          </button>
          <button
            className={view === 'trash' ? 'view-tab view-tab-active' : 'view-tab'}
            onClick={() => selectView('trash')}
            type="button"
          >
            Trash
          </button>
        </nav>
        <div className="header-meta">
          <span className="session-dot" />
          <span>Session active</span>
          <a className="header-link" href={drivePublicPath('/login')}>
            Sign in again
          </a>
        </div>
      </header>

      <main className="drive-main">
        <section aria-labelledby="drive-heading" className="drive-panel">
          <div className="drive-heading-row">
            <div>
              <p className="eyebrow">{isTrash ? 'Deleted items' : 'Private storage'}</p>
              <h1 id="drive-heading">{isTrash ? 'Trash' : 'My Drive'}</h1>
            </div>
            <div className="heading-count" aria-live="polite">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </div>
          </div>

          <div className="toolbar">
            <nav aria-label="Breadcrumb" className="breadcrumbs">
              {breadcrumbs.map((breadcrumb, index) => (
                <span className="breadcrumb-segment" key={`${breadcrumb.id ?? 'root'}-${index}`}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="breadcrumb-divider">
                      /
                    </span>
                  ) : null}
                  <button
                    className={index === breadcrumbs.length - 1 ? 'breadcrumb-current' : ''}
                    onClick={() => navigateToBreadcrumb(index)}
                    type="button"
                  >
                    {breadcrumb.name}
                  </button>
                </span>
              ))}
            </nav>
            <form className="search-form" onSubmit={handleSearchSubmit} role="search">
              <label className="sr-only" htmlFor="drive-search">
                Search files and folders
              </label>
              <input
                id="drive-search"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search files and folders"
                type="search"
                value={searchTerm}
              />
              <button className="button button-secondary" type="submit">
                Search
              </button>
              {activeSearch ? (
                <button className="button button-quiet" onClick={resetSearch} type="button">
                  Clear
                </button>
              ) : null}
            </form>
          </div>

          <div className="action-row">
            <div className="action-row-left">
              {!isTrash ? (
                <>
                  <input
                    className="sr-only"
                    id="drive-upload"
                    onChange={handleUploadChange}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="button button-primary"
                    disabled={busyAction !== null}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    {busyAction === 'upload' ? 'Uploading…' : 'Upload file'}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busyAction !== null}
                    onClick={openFolderDialog}
                    type="button"
                  >
                    New folder
                  </button>
                </>
              ) : (
                <p className="toolbar-hint">Items in Trash can be restored or permanently deleted.</p>
              )}
            </div>
            {activeSearch ? (
              <p className="toolbar-hint">
                Results for <strong>“{activeSearch}”</strong>
              </p>
            ) : null}
          </div>

          {statusMessage ? (
            <p aria-live="polite" className="status-message" role="status">
              {statusMessage}
            </p>
          ) : null}
          {error ? (
            <p aria-live="assertive" className="form-error page-error" role="alert">
              {error}
            </p>
          ) : null}

          <div aria-busy={loading} className="table-wrap">
            <table className="item-table">
              <caption className="sr-only">
                {isTrash ? 'Files and folders in Trash' : 'Files and folders in My Drive'}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="table-message" colSpan={4}>
                      Loading items…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="table-message" colSpan={4}>
                      <EmptyState isTrash={isTrash} isSearching={Boolean(activeSearch)} />
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="item-name-cell">
                          <span aria-hidden="true" className="item-glyph">
                            {item.kind === 'folder' ? '▰' : '▱'}
                          </span>
                          {item.kind === 'folder' && !isTrash ? (
                            <button className="item-name-link" onClick={() => openFolder(item)} type="button">
                              {item.name}
                            </button>
                          ) : (
                            <span className="item-name-text">{item.name}</span>
                          )}
                        </div>
                      </td>
                      <td>{item.kind === 'folder' ? 'Folder' : item.mimeType ?? 'File'}</td>
                      <td>
                        <span className="date-cell">{formatUpdatedAt(item.updatedAt)}</span>
                        {item.kind === 'file' ? (
                          <span className="size-cell">{formatFileSize(item.size)}</span>
                        ) : null}
                      </td>
                      <td>
                        <div aria-label={`Actions for ${item.name}`} className="item-actions">
                          {isTrash ? (
                            <>
                              <button
                                className="action-link"
                                disabled={busyAction !== null}
                                onClick={() => void handleRestore(item)}
                                type="button"
                              >
                                {busyAction === `restore-${item.id}` ? 'Restoring…' : 'Restore'}
                              </button>
                              <button
                                className="action-link action-link-danger"
                                disabled={busyAction !== null}
                                onClick={() => openConfirmDialog(item, 'permanent')}
                                type="button"
                              >
                                Delete forever
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="action-link"
                                disabled={busyAction !== null}
                                onClick={() => openRenameDialog(item)}
                                type="button"
                              >
                                Rename
                              </button>
                              <button
                                className="action-link"
                                disabled={busyAction !== null}
                                onClick={() => openMoveDialog(item)}
                                type="button"
                              >
                                Move
                              </button>
                              <button
                                className="action-link action-link-danger"
                                disabled={busyAction !== null}
                                onClick={() => openConfirmDialog(item, 'trash')}
                                type="button"
                              >
                                Trash
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {dialog ? (
        <div className="dialog-backdrop">
          <section
            aria-describedby="drive-dialog-description"
            aria-labelledby="drive-dialog-title"
            aria-modal="true"
            className="dialog-card"
            role="dialog"
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Drive action</p>
                <h2 id="drive-dialog-title">
                  {dialog.kind === 'folder'
                    ? 'Create a folder'
                    : dialog.kind === 'rename'
                      ? 'Rename item'
                      : dialog.kind === 'move'
                        ? 'Move item'
                        : dialog.action === 'trash'
                          ? 'Move to Trash?'
                          : 'Delete permanently?'}
                </h2>
              </div>
              <button aria-label="Close dialog" className="dialog-close" onClick={closeDialog} type="button">
                ×
              </button>
            </div>

            <p className="dialog-description" id="drive-dialog-description">
              {dialog.kind === 'folder'
                ? 'Create a new folder in the current location.'
                : dialog.kind === 'rename'
                  ? `Choose a new name for ${dialog.item.name}.`
                  : dialog.kind === 'move'
                    ? 'Enter a destination folder ID. Leave it blank to move the item to My Drive.'
                    : dialog.action === 'trash'
                      ? `${dialog.item.name} can be restored from Trash later.`
                      : `${dialog.item.name} and its contents will be permanently removed. This cannot be undone.`}
            </p>

            <form className="dialog-form" onSubmit={handleDialogSubmit}>
              {dialog.kind === 'folder' ? (
                <div className="field-group">
                  <label htmlFor="dialog-folder-name">Folder name</label>
                  <input
                    autoFocus
                    id="dialog-folder-name"
                    onChange={(event) => setDialogValue(event.target.value)}
                    placeholder="New folder"
                    required
                    value={dialogValue}
                  />
                </div>
              ) : null}
              {dialog.kind === 'rename' ? (
                <div className="field-group">
                  <label htmlFor="dialog-item-name">New name</label>
                  <input
                    autoFocus
                    id="dialog-item-name"
                    onChange={(event) => setDialogValue(event.target.value)}
                    required
                    value={dialogValue}
                  />
                </div>
              ) : null}
              {dialog.kind === 'move' ? (
                <div className="field-group">
                  <label htmlFor="dialog-parent-id">Destination folder ID</label>
                  <input
                    autoFocus
                    id="dialog-parent-id"
                    onChange={(event) => setDialogValue(event.target.value)}
                    placeholder="Folder UUID, or blank for My Drive"
                    value={dialogValue}
                  />
                  <p className="field-help">The current folder ID is pre-filled when available.</p>
                </div>
              ) : null}
              {dialogError ? (
                <p aria-live="polite" className="form-error" role="alert">
                  {dialogError}
                </p>
              ) : null}
              <div className="dialog-actions">
                <button className="button button-quiet" onClick={closeDialog} type="button">
                  Cancel
                </button>
                <button
                  className={dialog.kind === 'confirm' && dialog.action === 'permanent' ? 'button button-danger' : 'button button-primary'}
                  disabled={busyAction !== null}
                  type="submit"
                >
                  {busyAction
                    ? 'Working…'
                    : dialog.kind === 'folder'
                      ? 'Create folder'
                      : dialog.kind === 'rename'
                        ? 'Rename'
                        : dialog.kind === 'move'
                          ? 'Move'
                          : dialog.action === 'trash'
                            ? 'Move to Trash'
                            : 'Delete forever'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-page">
      <div aria-live="polite" className="loading-card" role="status">
        <span className="loading-spinner" />
        <span>{label}</span>
      </div>
    </main>
  );
}

function EmptyState({ isTrash, isSearching }: { isTrash: boolean; isSearching: boolean }) {
  if (isSearching) {
    return (
      <div className="empty-state">
        <strong>No matching items</strong>
        <span>Try a different search term.</span>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <strong>{isTrash ? 'Trash is empty' : 'This folder is empty'}</strong>
      <span>{isTrash ? 'Deleted items will appear here.' : 'Upload a file or create a folder to get started.'}</span>
    </div>
  );
}
