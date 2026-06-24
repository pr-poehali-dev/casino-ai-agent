import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

type Strategy = 'martingale' | 'fibonacci' | 'flat' | 'dalembert';

const STRATEGIES: { id: Strategy; name: string; desc: string; icon: string }[] = [
  { id: 'martingale', name: 'Мартингейл', desc: 'Удвоение после проигрыша', icon: 'TrendingUp' },
  { id: 'fibonacci', name: 'Фибоначчи', desc: 'Ставки по последовательности', icon: 'Spline' },
  { id: 'flat', name: 'Флэт', desc: 'Фиксированная ставка', icon: 'Minus' },
  { id: 'dalembert', name: "Д'Аламбер", desc: 'Плавная коррекция', icon: 'Activity' },
];

type LogEntry = { id: number; text: string; type: 'win' | 'loss' | 'info' };

const Index = () => {
  const [link, setLink] = useState('');
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('martingale');
  const [bet, setBet] = useState([100]);
  const [balance, setBalance] = useState(10000);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ rounds: 0, wins: 0, losses: 0, profit: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const tick = useRef(0);

  const addLog = (text: string, type: LogEntry['type']) => {
    setLogs((p) => [{ id: logId.current++, text, type }, ...p].slice(0, 8));
  };

  const analyze = () => {
    if (!link.trim()) return;
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
      addLog('Анализ завершён. Найдено: слоты, рулетка, RTP 96.4%', 'info');
    }, 1800);
  };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      tick.current++;
      const win = Math.random() > 0.47;
      const amount = bet[0];
      setBalance((b) => b + (win ? amount * 0.95 : -amount));
      setStats((s) => ({
        rounds: s.rounds + 1,
        wins: s.wins + (win ? 1 : 0),
        losses: s.losses + (win ? 0 : 1),
        profit: s.profit + (win ? amount * 0.95 : -amount),
      }));
      addLog(
        win ? `Раунд #${tick.current}: выигрыш +${Math.round(amount * 0.95)} ₽` : `Раунд #${tick.current}: проигрыш −${amount} ₽`,
        win ? 'win' : 'loss'
      );
    }, 1400);
    return () => clearInterval(t);
  }, [running, bet]);

  const winRate = stats.rounds ? Math.round((stats.wins / stats.rounds) * 100) : 0;

  return (
    <div className="min-h-screen grid-bg">
      {/* HEADER */}
      <header className="border-b border-border/50 glass sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-pulse-glow">
              <Icon name="Bot" className="text-background" size={22} />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-wide leading-none">NEON<span className="text-primary">.AI</span></h1>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Casino Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full glass">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-xs text-muted-foreground">{running ? 'Агент в игре' : 'Ожидание'}</span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="container pt-16 pb-10 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-muted-foreground mb-6">
          <Icon name="Sparkles" size={14} className="text-accent" />
          Нейросеть анализирует и играет за вас
        </div>
        <h2 className="font-display font-bold text-5xl md:text-7xl leading-[0.95] mb-5">
          ИИ-агент, который <br />
          <span className="text-gradient">обыгрывает казино</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto text-lg">
          Вставьте ссылку или ID казино — агент проанализирует площадку, выберет стратегию и сыграет автоматически.
        </p>
      </section>

      {/* ANALYZE BLOCK */}
      <section className="container max-w-3xl pb-12 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="glass rounded-2xl p-6 neon-border">
          <label className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
            <Icon name="Link2" size={16} className="text-primary" /> Ссылка или ID казино
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://casino.com/play  или  ID-489201"
              className="bg-muted/40 border-border h-12 text-base"
            />
            <Button
              onClick={analyze}
              disabled={analyzing}
              className="h-12 px-6 font-semibold bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90 shrink-0"
            >
              {analyzing ? (
                <><Icon name="Loader2" size={18} className="animate-spin-slow mr-2" /> Анализ...</>
              ) : (
                <><Icon name="ScanSearch" size={18} className="mr-2" /> Анализировать</>
              )}
            </Button>
          </div>
          {analyzed && (
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
              {[
                { l: 'RTP площадки', v: '96.4%', i: 'Percent' },
                { l: 'Волатильность', v: 'Средняя', i: 'Waves' },
                { l: 'Игр найдено', v: '184', i: 'Gamepad2' },
                { l: 'Оценка ИИ', v: 'A+', i: 'Award' },
              ].map((c) => (
                <div key={c.l} className="bg-muted/30 rounded-xl p-3 border border-border/50">
                  <Icon name={c.i} size={16} className="text-primary mb-1.5" />
                  <p className="text-[11px] text-muted-foreground">{c.l}</p>
                  <p className="font-display font-semibold text-lg">{c.v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CONTROL PANEL */}
      <section className="container max-w-6xl pb-24 grid lg:grid-cols-5 gap-6">
        {/* LEFT: settings */}
        <div className="lg:col-span-2 space-y-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="glass rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Icon name="Brain" size={18} className="text-secondary" /> Стратегия игры
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    strategy === s.id
                      ? 'border-primary bg-primary/10 neon-border'
                      : 'border-border bg-muted/20 hover:border-muted-foreground/40'
                  }`}
                >
                  <Icon name={s.icon} size={18} className={strategy === s.id ? 'text-primary' : 'text-muted-foreground'} />
                  <p className="font-semibold text-sm mt-2">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Icon name="Coins" size={18} className="text-accent" /> Размер ставки
              </h3>
              <span className="font-display font-bold text-xl text-primary">{bet[0]} ₽</span>
            </div>
            <Slider value={bet} onValueChange={setBet} min={50} max={2000} step={50} className="mb-2" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>50 ₽</span><span>2000 ₽</span>
            </div>
          </div>

          <Button
            onClick={() => setRunning((r) => !r)}
            disabled={!analyzed}
            className={`w-full h-14 text-base font-bold rounded-2xl transition-all ${
              running
                ? 'bg-destructive hover:bg-destructive/90 text-white'
                : 'bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90'
            } disabled:opacity-40`}
          >
            <Icon name={running ? 'Square' : 'Play'} size={20} className="mr-2" />
            {running ? 'Остановить агента' : analyzed ? 'Запустить автоигру' : 'Сначала проанализируйте'}
          </Button>
        </div>

        {/* RIGHT: live */}
        <div className="lg:col-span-3 space-y-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="relative overflow-hidden rounded-2xl p-6 neon-border bg-gradient-to-br from-[hsl(240_28%_11%)] to-[hsl(240_30%_7%)]">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-secondary/20 blur-3xl pointer-events-none" />
            <div className="relative flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
                <Icon name="Wallet" size={15} /> Casino Balance
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${stats.profit >= 0 ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                <Icon name={stats.profit >= 0 ? 'ArrowUpRight' : 'ArrowDownRight'} size={12} />
                {stats.profit >= 0 ? '+' : ''}{Math.round(stats.profit).toLocaleString('ru')} ₽
              </span>
            </div>
            <div className="relative flex items-baseline gap-2 mb-1">
              <span className="font-display font-bold text-6xl tracking-tight text-gradient tabular-nums">
                {Math.round(balance).toLocaleString('ru')}
              </span>
              <span className="font-display text-3xl text-muted-foreground">₽</span>
            </div>
            <p className="relative text-[11px] text-muted-foreground mb-6 flex items-center gap-1.5">
              <Icon name="Chip" fallback="CircleDollarSign" size={13} className="text-accent" />
              Игровой счёт · ставка {bet[0]} ₽ · {STRATEGIES.find((s) => s.id === strategy)?.name}
            </p>
            <div className="relative grid grid-cols-3 gap-3">
              {[
                { l: 'Раундов', v: stats.rounds, c: 'text-foreground' },
                { l: 'Винрейт', v: `${winRate}%`, c: 'text-primary' },
                { l: 'Победы/Поражения', v: `${stats.wins}/${stats.losses}`, c: 'text-secondary' },
              ].map((m) => (
                <div key={m.l} className="bg-background/40 rounded-xl p-3 text-center border border-border/50 backdrop-blur-sm">
                  <p className={`font-display font-bold text-2xl ${m.c}`}>{m.v}</p>
                  <p className="text-[11px] text-muted-foreground">{m.l}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6 min-h-[260px]">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Icon name="ScrollText" size={18} className="text-primary" /> Лента действий агента
            </h3>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Icon name="Inbox" size={36} className="mb-3 opacity-40" />
                <p className="text-sm">Запустите агента — здесь появятся ходы в реальном времени</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm border animate-fade-in ${
                      l.type === 'win'
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : l.type === 'loss'
                        ? 'bg-destructive/10 border-destructive/30 text-destructive'
                        : 'bg-muted/30 border-border text-muted-foreground'
                    }`}
                  >
                    <Icon name={l.type === 'win' ? 'CheckCircle2' : l.type === 'loss' ? 'XCircle' : 'Info'} size={16} />
                    {l.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        NEON.AI — демонстрационный интерфейс ИИ-агента. Играйте ответственно.
      </footer>
    </div>
  );
};

export default Index;