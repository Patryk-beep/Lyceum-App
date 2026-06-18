export interface Stat {
  label: string;
  value: string | number;
}

export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-grid" data-testid="stat-grid">
      {stats.map((s) => (
        <div className="card stat" key={s.label}>
          <div className="stat__value metric">{s.value}</div>
          <div className="stat__label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
