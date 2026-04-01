// src/tabs/BlogAdmin.jsx
import { useState, useEffect } from 'react';

const BASE          = import.meta.env.VITE_API_BASE;
const ADMIN_PASSWORD = 'quaint2024!';

const CATEGORIES = [
  'Market Analysis', 'Options Strategy', 'Technical Analysis',
  'Macro & Economy', 'Stock Spotlight', 'Trading Education',
];

const SUGGESTED_TOPICS = [
  'How to use RSI to time options entries',
  'Understanding IV crush around earnings',
  'Reading the VIX for market direction',
  'MACD crossover strategy for swing trades',
  'How to pick the right options expiry date',
  'Bull vs bear spreads — when to use each',
  'Global macro signals every trader should watch',
  'How AI is changing stock analysis',
  'DXY dollar index and what it means for stocks',
  'Top technical indicators for short-term trading',
];

export default function BlogAdmin() {
  const [authed,      setAuthed]      = useState(false);
  const [password,    setPassword]    = useState('');
  const [authError,   setAuthError]   = useState('');
  const [topic,       setTopic]       = useState('');
  const [ticker,      setTicker]      = useState('');
  const [category,    setCategory]    = useState('Market Analysis');
  const [generating,  setGenerating]  = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [preview,     setPreview]     = useState(null);
  const [posts,       setPosts]       = useState([]);
  const [loadingPosts,setLoadingPosts]= useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  useEffect(() => {
    if (authed) fetchPosts();
  }, [authed]);

  const fetchPosts = async () => {
    setLoadingPosts(true);
    try {
      const res  = await fetch(`${BASE}/blog/admin/all`);
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch {}
    setLoadingPosts(false);
  };

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) { setAuthed(true); setAuthError(''); }
    else setAuthError('Incorrect password');
  };

  const handleGenerate = async () => {
    if (!topic.trim()) { setError('Enter a topic first'); return; }
    setGenerating(true); setError(''); setPreview(null);
    try {
      const res  = await fetch(`${BASE}/blog/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, ticker: ticker.trim().toUpperCase(), category }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreview(data);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  const handlePublish = async () => {
    if (!preview) return;
    setPublishing(true); setError(''); setSuccess('');
    try {
      const res  = await fetch(`${BASE}/blog/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preview, category }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess(`Published: "${preview.title}"`);
      setPreview(null); setTopic(''); setTicker('');
      fetchPosts();
    } catch (e) { setError(e.message); }
    setPublishing(false);
  };

  const handleDelete = async (slug) => {
    if (!confirm('Delete this post?')) return;
    try {
      await fetch(`${BASE}/blog/${slug}`, { method: 'DELETE' });
      fetchPosts();
    } catch {}
  };

  // ── Login screen ──
  if (!authed) {
    return (
      <div style={{ maxWidth: 360, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#ffaa00', marginBottom: 24 }}>
          BLOG ADMIN
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="Admin password"
          className="input"
          style={{ marginBottom: 12, textAlign: 'center' }}
        />
        {authError && <div style={{ fontSize: 11, color: '#ff4444', marginBottom: 8 }}>{authError}</div>}
        <button className="btn" style={{ width: '100%' }} onClick={handleLogin}>
          ENTER
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#ffaa00' }}>
          BLOG ADMIN
        </div>
        <button className="btn-sm" style={{ color: '#b0c0dd', borderColor: '#3a3a5e' }}
          onClick={() => setAuthed(false)}>
          LOGOUT
        </button>
      </div>

      {/* ── Generator ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#ffaa00', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 16 }}>
          GENERATE NEW POST
        </div>

        {/* Suggested topics */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#7788aa', marginBottom: 6, letterSpacing: '0.1em' }}>SUGGESTED TOPICS</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUGGESTED_TOPICS.map(t => (
              <button key={t}
                onClick={() => setTopic(t)}
                style={{
                  background: topic === t ? '#ffaa0011' : '#0a0a14',
                  border: `1px solid ${topic === t ? '#ffaa0044' : '#2a2a40'}`,
                  color: topic === t ? '#ffaa00' : '#99aacc',
                  cursor: 'pointer', padding: '4px 10px', borderRadius: 2,
                  fontSize: 10, fontFamily: 'inherit', transition: 'all 0.1s',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Topic input */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 6, letterSpacing: '0.1em' }}>TOPIC</div>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. How to read options flow for directional trades"
            className="input"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 6, letterSpacing: '0.1em' }}>TICKER (optional)</div>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA"
              className="input"
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 6, letterSpacing: '0.1em' }}>CATEGORY</div>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input"
              style={{ cursor: 'pointer' }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <button className="btn" onClick={handleGenerate} disabled={generating} style={{ width: '100%' }}>
          {generating ? 'GENERATING...' : '⚡ GENERATE WITH AI'}
        </button>

        {error && <div style={{ fontSize: 11, color: '#ff4444', marginTop: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 11, color: '#00ff88', marginTop: 10 }}>{success}</div>}
      </div>

      {/* ── Preview ── */}
      {preview && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#00ff8833' }}>
          <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 16 }}>
            PREVIEW
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 4 }}>TITLE</div>
            <input
              value={preview.title}
              onChange={e => setPreview(p => ({ ...p, title: e.target.value }))}
              className="input"
              style={{ fontWeight: 700 }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 4 }}>SLUG</div>
            <input
              value={preview.slug}
              onChange={e => setPreview(p => ({ ...p, slug: e.target.value }))}
              className="input"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 4 }}>EXCERPT</div>
            <textarea
              value={preview.excerpt}
              onChange={e => setPreview(p => ({ ...p, excerpt: e.target.value }))}
              className="input"
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#b0c0dd', marginBottom: 8 }}>CONTENT PREVIEW</div>
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: preview.content }}
              style={{
                fontSize: 12, color: '#d0d8f0', lineHeight: 1.8,
                background: '#070710', padding: 16, borderRadius: 4,
                maxHeight: 400, overflowY: 'auto',
                border: '1px solid #1a1a2e',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={handlePublish} disabled={publishing} style={{ flex: 1 }}>
              {publishing ? 'PUBLISHING...' : '✓ PUBLISH'}
            </button>
            <button className="btn-sm" style={{ color: '#ff4444', borderColor: '#ff444433' }}
              onClick={() => setPreview(null)}>
              DISCARD
            </button>
          </div>
        </div>
      )}

      {/* ── Published posts ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#b0c0dd', fontWeight: 700, letterSpacing: '0.15em' }}>
            ALL POSTS ({posts.length})
          </div>
          <button className="btn-sm" style={{ color: '#b0c0dd', borderColor: '#3a3a5e' }}
            onClick={fetchPosts}>
            REFRESH
          </button>
        </div>

        {loadingPosts && (
          <div style={{ fontSize: 12, color: '#7788aa', textAlign: 'center', padding: '20px 0' }}>
            LOADING...
          </div>
        )}

        {posts.length === 0 && !loadingPosts && (
          <div style={{ fontSize: 12, color: '#7788aa', textAlign: 'center', padding: '20px 0' }}>
            No posts yet
          </div>
        )}

        {posts.map((post, i) => (
          <div key={post.slug} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 0',
            borderBottom: i < posts.length - 1 ? '1px solid #1a1a26' : 'none',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: post.published ? '#00ff88' : '#ff4444',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#e8e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {post.title}
              </div>
              <div style={{ fontSize: 10, color: '#7788aa', marginTop: 2 }}>
                {post.category} · {new Date(post.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => handleDelete(post.slug)}
              style={{
                background: 'none', border: '1px solid #ff444433',
                color: '#ff444488', cursor: 'pointer', borderRadius: 2,
                padding: '3px 8px', fontSize: 10, fontFamily: 'inherit',
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.borderColor = '#ff4444'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#ff444488'; e.currentTarget.style.borderColor = '#ff444433'; }}
            >
              DELETE
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}