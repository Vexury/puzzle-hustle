import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, readSession } from '../lib/api.ts';
import { useSession } from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { toast } from '../components/Toast.tsx';

export interface Group {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function useGroups(): { groups: Group[]; reload: () => void; loading: boolean } {
  const session = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!session) {
      setGroups([]);
      return;
    }
    setLoading(true);
    apiFetch<{ groups: Group[] }>('/groups', { auth: true })
      // A sign-out (or account switch) while this request is in flight must not let a late
      // response repopulate a list for a session that is no longer current.
      .then((data) => {
        if (readSession()?.token === session.token) setGroups(data.groups);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(reload, [reload]);
  return { groups, reload, loading };
}

const MESSAGES: Record<string, string> = {
  group_unknown: 'No group with that code',
  group_already: 'You are already in that group',
  group_full: 'That group is full',
  group_limit: 'You are in five groups already',
  group_name: 'Pick a different name',
  offline: 'No connection',
};

export function explain(err: unknown): string {
  return err instanceof ApiError ? (MESSAGES[err.code] ?? 'Something went wrong') : 'Something went wrong';
}

export function Friends() {
  const session = useSession();
  const { groups, reload } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (!session) {
    return (
      <section className="page-head">
        <h1>Friends</h1>
        <p className="muted">Sign in on the Profile tab to compare your daily times with a group of friends.</p>
        <a href={href('/profile')} className="pill" onClick={onLinkClick}>
          To Profile ›
        </a>
      </section>
    );
  }

  const create = async () => {
    try {
      await apiFetch<Group>('/groups', { method: 'POST', body: JSON.stringify({ name }), auth: true });
      setName('');
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  const join = async () => {
    try {
      const group = await apiFetch<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ code }), auth: true });
      setCode('');
      reload();
      toast(`Joined ${group.name}`);
    } catch (err) {
      toast(explain(err));
    }
  };

  const leave = async (group: Group) => {
    try {
      await apiFetch('/groups/leave', { method: 'POST', body: JSON.stringify({ id: group.id }), auth: true });
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  return (
    <>
      <section className="page-head">
        <h1>Friends</h1>
      </section>

      {groups.map((group) => (
        <div key={group.id} className="row-card friends-row">
          <span className="row-text">
            <span className="row-title">{group.name}</span>
            <span className="row-sub">
              {group.members} member{group.members === 1 ? '' : 's'} · code <b className="num">{group.code}</b>
            </span>
          </span>
          <button type="button" className="pill outline" onClick={() => void leave(group)}>
            Leave
          </button>
        </div>
      ))}

      <section className="card-lg">
        <h2>New group</h2>
        <div className="friends-actions">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Group name" />
          <button type="button" className="pill" onClick={() => void create()} disabled={name.trim().length < 2}>
            Create
          </button>
        </div>
      </section>

      <section className="card-lg">
        <h2>Join a group</h2>
        <div className="friends-actions">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CODE"
            className="num"
          />
          <button type="button" className="pill" onClick={() => void join()} disabled={code.length !== 6}>
            Join
          </button>
        </div>
      </section>
    </>
  );
}
