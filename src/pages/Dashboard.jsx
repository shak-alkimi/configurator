import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Package, FileText, TrendingUp, Sliders, BookOpen, Boxes, Users } from "lucide-react";
import PortalShell from "@/components/PortalShell";
import { useAuth } from "@/lib/AuthContext";

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (target === 0) { setValue(0); return; }
    let raf;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCounter({ value, label }) {
  const display = useCountUp(value);
  return (
    <div
      className="text-[64px] font-semibold leading-none text-foreground tabular-nums"
      aria-label={`${value} ${label}`}
    >
      {display}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  const counts = {
    estimates: projects.length,
    orders: projects.filter(p => p.status === 'submitted' || p.status === 'approved').length,
    reps: isAdmin
      ? new Set(projects.map(p => p.created_by).filter(Boolean)).size
      : 0,
  };

  const currentMonth = format(new Date(), 'MMMM');

  const allCards = [
    {
      icon: Sliders,
      category: 'Tool',
      label: 'Configurator',
      href: '/',
      stat: null,
      roles: ['admin', 'rep'],
    },
    {
      icon: FileText,
      category: currentMonth,
      label: 'Estimates',
      href: '/estimates',
      stat: isLoading ? null : { value: counts.estimates, label: 'total' },
      roles: ['admin', 'rep'],
    },
    {
      icon: Package,
      category: currentMonth,
      label: 'Orders',
      href: '/orders',
      stat: isLoading ? null : { value: counts.orders, label: 'active' },
      roles: ['admin', 'rep'],
    },
    {
      icon: Users,
      category: 'Team',
      label: 'Reps',
      href: '/reps',
      stat: isLoading ? null : { value: counts.reps, label: 'active' },
      roles: ['admin'],
    },
    {
      icon: Boxes,
      category: 'Catalog',
      label: 'Inventory',
      href: '/inventory',
      stat: null,
      soon: true,
      roles: ['admin'],
    },
    {
      icon: TrendingUp,
      category: 'Reports',
      label: 'Sales',
      href: '/sales',
      stat: null,
      soon: true,
      roles: ['admin'],
    },
    {
      icon: BookOpen,
      category: 'Resources',
      label: 'Documentation',
      href: '/docs',
      stat: null,
      soon: true,
      roles: ['admin', 'rep'],
    },
  ];
  const cards = allCards.filter((c) =>
    isAdmin ? c.roles.includes('admin') : c.roles.includes('rep')
  );

  return (
    <PortalShell>
      <div className="px-[15px] pt-[92px] pb-8 flex-1 flex flex-col min-h-0">
        <h1 className="sr-only">Dashboard</h1>
        <div
          className="grid grid-cols-3 gap-[15px] flex-1 min-h-0"
          style={{
            gridTemplateRows: `repeat(${Math.max(1, Math.ceil(cards.length / 3))}, minmax(0, 1fr))`,
          }}
          data-testid="dashboard-card-grid"
        >
          {cards.map(({ icon: Icon, category, label, href, stat, soon }) => (
            <button
              key={label}
              type="button"
              onClick={() => !soon && navigate(href)}
              disabled={soon}
              className={`group relative bg-secondary overflow-hidden rounded-[10px] flex flex-col text-left h-full p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                soon ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
              data-testid={`dashboard-card-${label.toLowerCase()}`}
            >
              <div
                className={`flex-1 min-h-0 flex items-center justify-center transition-transform duration-500 ease-out ${
                  soon ? '' : 'group-hover:scale-105'
                }`}
              >
                {stat ? (
                  <StatCounter value={stat.value} label={stat.label} />
                ) : (
                  <Icon
                    className={`h-12 w-12 ${
                      soon ? 'text-foreground/25' : 'text-foreground/50'
                    }`}
                    strokeWidth={1.25}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="mt-2 flex flex-col items-center gap-1.5">
                <div className="text-xs text-foreground/60">{category}</div>
                <div
                  className={`text-[22px] font-semibold leading-none text-center ${
                    soon ? 'text-foreground/40' : 'text-foreground'
                  }`}
                >
                  {label}
                </div>
              </div>

              {soon && (
                <span className="absolute top-4 right-4 text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}
