import { useEffect, useState, useCallback } from 'react';
import {
  fetchAdminUsers, fetchAdminInvites, fetchAuditLog, fetchAdminStats,
  disableUser, enableUser, deleteUser, purgeUser,
  createInvite, revokeInvite,
  type AdminUser, type AdminInvite, type AuditEntry, type AdminStats,
} from '../../services/api';
import type { AuthUser } from '../../services/auth';

interface AdminDashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [users, setUsers] = useState<{ active: AdminUser[]; deleted: AdminUser[] } | null>(null);
  const [invites, setInvites] = useState<AdminInvite[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'audit'>('users');

  const load = useCallback(async () => {
    setError('');
    try {
      const [u, i, a, s] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminInvites(),
        fetchAuditLog(),
        fetchAdminStats(),
      ]);
      setUsers(u);
      setInvites(i);
      setAudit(a);
      setStats(s);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisable(id: string) {
    await disableUser(id).catch(() => {});
    load();
  }

  async function handleEnable(id: string) {
    await enableUser(id).catch(() => {});
    load();
  }

  async function handleDelete(id: string) {
    await deleteUser(id).catch(() => {});
    load();
  }

  async function handlePurge(id: string) {
    if (confirmPurge !== id) {
      setConfirmPurge(id);
      return;
    }
    setConfirmPurge(null);
    await purgeUser(id).catch(() => {});
    load();
  }

  async function handleGenerateInvite() {
    setGeneratingInvite(true);
    setNewCode(null);
    try {
      const invite = await createInvite(inviteExpiry || undefined);
      setNewCode(invite.code);
      setInviteExpiry('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setGeneratingInvite(false);
    }
  }

  async function handleRevoke(id: string) {
    await revokeInvite(id).catch(() => {});
    load();
  }

  return (
    <div className="admin dark">
      <header className="admin-header">
        <div className="admin-header__title">
          <a href="/" className="admin-back-link">← Back to app</a>
          <h1 className="admin-title">Admin</h1>
        </div>
        <div className="admin-header__actions">
          <span className="admin-user-badge">{user.email}</span>
          <button className="admin-logout-btn" onClick={onLogout}>Log out</button>
        </div>
      </header>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {stats && (
        <div className="admin-stats">
          <div className="admin-stat"><span className="admin-stat__value">{stats.activeUsers}</span><span className="admin-stat__label">Active users</span></div>
          <div className="admin-stat"><span className="admin-stat__value">{stats.totalUsers}</span><span className="admin-stat__label">Total users</span></div>
          <div className="admin-stat"><span className="admin-stat__value">{stats.tasksThisWeek}</span><span className="admin-stat__label">Tasks this week</span></div>
          <div className="admin-stat"><span className="admin-stat__value">{stats.sessionsThisWeek}</span><span className="admin-stat__label">Sessions this week</span></div>
          <div className="admin-stat"><span className="admin-stat__value">{stats.loginsToday}</span><span className="admin-stat__label">Logins today</span></div>
        </div>
      )}

      <div className="admin-tabs" role="tablist">
        {(['users', 'invites', 'audit'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`admin-tab${activeTab === tab ? ' admin-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Users ── */}
      {activeTab === 'users' && users && (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Last seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.active.map(u => (
                <tr key={u.id} className={u.is_active ? '' : 'admin-table__row--disabled'}>
                  <td>{u.email}</td>
                  <td><span className={`admin-role admin-role--${u.role}`}>{u.role}</span></td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{formatDate(u.last_seen)}</td>
                  <td className="admin-table__actions">
                    {u.id !== user.id && u.role !== 'owner' && (
                      <>
                        {u.is_active
                          ? <button className="admin-btn admin-btn--warn" onClick={() => handleDisable(u.id)}>Disable</button>
                          : <button className="admin-btn" onClick={() => handleEnable(u.id)}>Enable</button>
                        }
                        <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(u.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.deleted.length > 0 && (
            <div className="admin-deleted-section">
              <button
                className="admin-toggle"
                onClick={() => setShowDeleted(v => !v)}
                aria-expanded={showDeleted}
              >
                {showDeleted ? '▾' : '▸'} Deleted accounts ({users.deleted.length})
              </button>
              {showDeleted && (
                <table className="admin-table admin-table--muted">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Deleted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.deleted.map(u => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{formatDate(u.deleted_at)}</td>
                        <td className="admin-table__actions">
                          {user.role === 'owner' && (
                            <button
                              className={`admin-btn admin-btn--danger${confirmPurge === u.id ? ' admin-btn--confirm' : ''}`}
                              onClick={() => handlePurge(u.id)}
                            >
                              {confirmPurge === u.id ? 'Confirm purge' : 'Purge'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Invites ── */}
      {activeTab === 'invites' && invites && (
        <div className="admin-section">
          <div className="admin-invite-form">
            <h2 className="admin-section__title">Generate invite code</h2>
            <div className="admin-invite-form__row">
              <label className="admin-label" htmlFor="invite-expiry">Expiry (optional)</label>
              <input
                id="invite-expiry"
                type="date"
                className="admin-input"
                value={inviteExpiry}
                onChange={e => setInviteExpiry(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <button
                className="admin-btn"
                onClick={handleGenerateInvite}
                disabled={generatingInvite}
              >
                {generatingInvite ? 'Generating…' : 'Generate'}
              </button>
            </div>

            {newCode && (
              <div className="admin-new-code">
                <span className="admin-new-code__label">New code:</span>
                <code className="admin-new-code__value">{newCode}</code>
                <button
                  className="admin-btn admin-btn--small"
                  onClick={() => copyToClipboard(newCode)}
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Created by</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => {
                const isUsed = !!inv.used_at;
                const isExpired = inv.expires_at ? new Date(inv.expires_at) < new Date() : false;
                const status = isUsed
                  ? `Used by ${inv.used_by_email || '?'}`
                  : isExpired ? 'Expired' : 'Unused';
                return (
                  <tr key={inv.id} className={isUsed || isExpired ? 'admin-table__row--disabled' : ''}>
                    <td><code className="admin-code">{inv.code}</code></td>
                    <td>{inv.created_by_email}</td>
                    <td>{formatDate(inv.created_at)}</td>
                    <td>{inv.expires_at ? formatDate(inv.expires_at) : 'Never'}</td>
                    <td>{status}</td>
                    <td className="admin-table__actions">
                      {!isUsed && !isExpired && (
                        <button className="admin-btn admin-btn--warn" onClick={() => handleRevoke(inv.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr><td colSpan={6} className="admin-table__empty">No invite codes yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Audit log ── */}
      {activeTab === 'audit' && audit && (
        <div className="admin-section">
          <table className="admin-table admin-table--audit">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>IP</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(entry => (
                <tr key={entry.id}>
                  <td className="admin-table__nowrap">{formatDate(entry.created_at)}</td>
                  <td>{entry.user_email || '—'}</td>
                  <td><code className="admin-code">{entry.action}</code></td>
                  <td>{entry.ip || '—'}</td>
                  <td className="admin-table__detail">{entry.detail || '—'}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr><td colSpan={5} className="admin-table__empty">No audit entries yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
