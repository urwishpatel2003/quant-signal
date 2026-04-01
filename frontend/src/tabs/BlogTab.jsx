// src/tabs/BlogTab.jsx
import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_BASE;

function PostCard({ post, onClick }) {
  const date = new Date(post.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0044'; e.currentTarget.style.background = '#141420'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.background = '#0f0f1a'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, color: '#ffaa00', background: '#ffaa0011',
          border: '1px solid #ffaa0033', padding: '2px 8px', borderRadius: 2,
          letterSpacing: '0.1em', fontWeight: 700,
        }}>{post.category}</span>
        <span style={{ fontSize: 10, color: '#7788aa' }}>{date}</span>
      </div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#e8e8f0', marginBottom: 8, lineHeight: 1.2 }}>
        {post.title}
      </div>
      <div style={{ fontSize: 12, color: '#99aacc', lineHeight: 1.7, marginBottom: 12 }}>
        {post.excerpt}
      </div>
      {post.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {post.tags.slice(0, 4).map(tag => (
            <span key={tag} style={{
              fontSize: 9, color: '#7788aa', background: '#1a1a2e',
              padding: '2px 6px', borderRadius: 2, letterSpacing: '0.05em',
            }}>#{tag}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: '#ffaa00', letterSpacing: '0.1em' }}>
        READ MORE →
      </div>
    </div>
  );
}

function PostView({ post, onBack }) {
  const date = new Date(post.created_at).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: '1px solid #2a2a40',
          color: '#b0c0dd', cursor: 'pointer', borderRadius: 4,
          padding: '8px 14px', fontSize: 12, fontFamily: 'inherit',
          letterSpacing: '0.1em', marginBottom: 24, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffaa0066'; e.currentTarget.style.color = '#ffaa00'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a40'; e.currentTarget.style.color = '#b0c0dd'; }}
      >← BACK TO BLOG</button>

      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, color: '#ffaa00', background: '#ffaa0011',
          border: '1px solid #ffaa0033', padding: '2px 8px', borderRadius: 2,
          letterSpacing: '0.1em', fontWeight: 700,
        }}>{post.category}</span>
        <span style={{ fontSize: 10, color: '#7788aa' }}>{date}</span>
      </div>

      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(24px, 5vw, 40px)',
        color: '#e8e8f0', lineHeight: 1.1, marginBottom: 16,
      }}>
        {post.title}
      </div>

      <div style={{
        fontSize: 13, color: '#99aacc', lineHeight: 1.8,
        borderLeft: '2px solid #ffaa0033', paddingLeft: 14,
        marginBottom: 28, fontStyle: 'italic',
      }}>
        {post.excerpt}
      </div>

      {/* Blog content */}
      <div
        className="blog-content"
        dangerouslySetInnerHTML={{ __html: post.content }}
        style={{ fontSize: 13, color: '#d0d8f0', lineHeight: 1.9 }}
      />

      {post.tags?.length > 0 && (
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #2a2a40', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {post.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10, color: '#7788aa', background: '#1a1a2e',
              padding: '3px 8px', borderRadius: 2, letterSpacing: '0.05em',
            }}>#{tag}</span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 32, padding: '20px', background: '#0f0f1a', border: '1px solid #2a2a40', borderRadius: 6, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#ffaa00', marginBottom: 8 }}>
          GET AI TRADE SIGNALS
        </div>
        <div style={{ fontSize: 12, color: '#99aacc', marginBottom: 14 }}>
          Scan any stock in 20 seconds — exact entry, target, stop loss
        </div>
        <a href="/" style={{
          display: 'inline-block', background: '#ffaa00', color: '#07070e',
          padding: '10px 24px', borderRadius: 4, fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
          letterSpacing: '0.1em', textDecoration: 'none',
        }}>TRY FREE →</a>
      </div>
    </div>
  );
}

export default function BlogTab() {
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activePost, setActivePost] = useState(null);
  const [error,      setError]      = useState('');

  useEffect(() => {
    fetch(`${BASE}/blog`)
      .then(r => r.json())
      .then(data => { setPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (activePost) return <PostView post={activePost} onBack={() => setActivePost(null)} />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#ffaa00', marginBottom: 4 }}>
          TRADING INSIGHTS
        </div>
        <div style={{ fontSize: 12, color: '#7788aa' }}>
          Market analysis, options strategies, and AI-powered trading education
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 12, color: '#7788aa' }}>
          LOADING POSTS...
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', textAlign: 'center', padding: '20px 0' }}>
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, color: '#99aacc' }}>No posts yet</div>
          <div style={{ fontSize: 11, color: '#7788aa', marginTop: 8 }}>
            Check back soon for market analysis and trading insights
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {posts.map(post => (
          <PostCard key={post.slug} post={post} onClick={() => setActivePost(post)} />
        ))}
      </div>
    </div>
  );
}