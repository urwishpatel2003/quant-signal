import { SC, RC, MC, GC } from '../utils/constants';

export default function SignalCard({ analysis, news }) {
  if (!analysis) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card fade-in" style={{ borderColor: SC[analysis.signal] + '44' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: SC[analysis.signal], lineHeight: 1 }}>{analysis.signal}</div>
            <div style={{ fontSize: 11, color: '#556', marginTop: 2 }}>{analysis.timeframe}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              {analysis.macroImpact       && <span style={{ fontSize: 10, color: MC[analysis.macroImpact]       }}>MACRO: {analysis.macroImpact}</span>}
              {analysis.globalMarketTrend && <span style={{ fontSize: 10, color: GC[analysis.globalMarketTrend] }}>GLOBAL: {analysis.globalMarketTrend}</span>}
              {analysis.geopoliticalRisk  && <span style={{ fontSize: 10, color: RC[analysis.geopoliticalRisk]  }}>GEO: {analysis.geopoliticalRisk}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#556' }}>CONFIDENCE</div>
            <div style={{ fontSize: 32, fontWeight: 600 }}>{analysis.confidence}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${analysis.confidence}%`, background: SC[analysis.signal] }} /></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[['TARGET', `$${analysis.priceTarget?.toFixed(2)}`, '#00ff88'], ['STOP LOSS', `$${analysis.stopLoss?.toFixed(2)}`, '#ff4444'], ['RISK', analysis.riskLevel, RC[analysis.riskLevel]]].map(([l, v, c]) => (
            <div key={l} style={{ background: '#070710', padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#445', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.7, borderLeft: `2px solid ${SC[analysis.signal]}44`, paddingLeft: 12 }}>{analysis.thesis}</div>
        {analysis.bondSignal    && <div style={{ fontSize: 10, color: '#ffaa0077', marginTop: 8,  borderLeft: '2px solid #ffaa0033', paddingLeft: 8 }}>📊 {analysis.bondSignal}</div>}
        {analysis.calendarRisk  && <div style={{ fontSize: 10, color: '#ff884477', marginTop: 6,  borderLeft: '2px solid #ff884433', paddingLeft: 8 }}>📅 {analysis.calendarRisk}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: '#00ff8866', marginBottom: 10 }}>BULL FACTORS</div>
          {analysis.bullFactors?.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #0f1a14', display: 'flex', gap: 6 }}>
              <span style={{ color: '#00ff88' }}>▲</span>{f}
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: '#ff444466', marginBottom: 10 }}>BEAR FACTORS</div>
          {analysis.bearFactors?.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: '#8899aa', padding: '5px 0', borderBottom: '1px solid #1a0f0f', display: 'flex', gap: 6 }}>
              <span style={{ color: '#ff4444' }}>▼</span>{f}
            </div>
          ))}
        </div>
      </div>

      {news?.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, color: '#444', marginBottom: 12 }}>RECENT NEWS</div>
          {news.slice(0, 5).map((n, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #1a1a26', fontSize: 11 }}>
              <div style={{ color: '#aab', lineHeight: 1.4, marginBottom: 2 }}>{n.title}</div>
              <div style={{ color: '#445', fontSize: 10 }}>{n.publisher} · {new Date(n.time * 1000).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
