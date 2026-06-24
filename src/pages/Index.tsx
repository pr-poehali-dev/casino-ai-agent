import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

const API = {
  analyzer: 'https://functions.poehali.dev/11d5c0e3-f45f-4aed-8141-a2131ad9a1ae',
  agent:    'https://functions.poehali.dev/3c59ca72-b708-44fc-a284-ec3aa0f0ef3c',
  chat:     'https://functions.poehali.dev/be0ab2d0-b589-4a78-b8f4-9c90c2610f60',
};

type Strategy = 'martingale' | 'fibonacci' | 'flat' | 'dalembert';
type Step = 'analyze' | 'login' | 'play';

const STRATEGIES: { id: Strategy; name: string; desc: string; icon: string }[] = [
  { id: 'martingale', name: 'Мартингейл', desc: 'Удвоение после проигрыша', icon: 'TrendingUp' },
  { id: 'fibonacci',  name: 'Фибоначчи',  desc: 'Ставки по последовательности', icon: 'Spline' },
  { id: 'flat',       name: 'Флэт',        desc: 'Фиксированная ставка', icon: 'Minus' },
  { id: 'dalembert',  name: "Д'Аламбер",   desc: 'Плавная коррекция', icon: 'Activity' },
];

type LogEntry = { id: number; text: string; type: 'win' | 'loss' | 'info' };
type ChatMsg  = { role: 'user' | 'ai'; text: string };

export default function Index() {
  // steps
  const [step, setStep] = useState<Step>('analyze');

  // analyze
  const [link, setLink]           = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [casino, setCasino]       = useState<Record<string, unknown> | null>(null);
  const [aiComment, setAiComment] = useState('');
  const [sessionId, setSessionId] = useState('');

  // login
  const [loginVal, setLoginVal]   = useState('');
  const [passVal, setPassVal]     = useState('');
  const [logging, setLogging]     = useState(false);
  const [loginErr, setLoginErr]   = useState('');

  // play state (real from backend)
  const [balance, setBalance]           = useState<number | null>(null);
  const [currency, setCurrency]         = useState('RUB');
  const [username, setUsername]         = useState('');
  const [strategy, setStrategy]         = useState<Strategy>('martingale');
  const [bet, setBet]                   = useState([100]);
  const [running, setRunning]           = useState(false);
  const [stats, setStats]               = useState({ rounds: 0, wins: 0, losses: 0, profit: 0 });
  const [logs, setLogs]                 = useState<LogEntry[]>([]);
  const [consecutiveLosses, setConLoss] = useState(0);
  const [prevBet, setPrevBet]           = useState(100);
  const logId   = useRef(0);
  const running$ = useRef(false);

  // chat
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs]   = useState<ChatMsg[]>([
    { role: 'ai', text: 'Привет! Я ИИ-аналитик. Спрашивай о стратегиях, RTP, банкролле или текущей сессии.' },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, type: LogEntry['type']) =>
    setLogs(p => [{ id: logId.current++, text, type }, ...p].slice(0, 10));

  // ── ANALYZE ────────────────────────────────────────────
  const analyze = async () => {
    if (!link.trim()) return;
    setAnalyzing(true);
    setCasino(null);
    try {
      const sid = 'sess_' + Date.now().toString(36);
      const r = await fetch(API.analyzer, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, session_id: sid }),
      });
      const data = await r.json();
      setCasino(data.casino);
      setAiComment(data.ai_comment);
      setSessionId(sid);
      // auto-pick recommended strategy
      const rec = data.recommended_strategy?.name ?? '';
      if (rec.includes('Фибоначчи')) setStrategy('fibonacci');
      else if (rec.includes('Флэт')) setStrategy('flat');
      else if (rec.includes("Д'Аламбер")) setStrategy('dalembert');
      else setStrategy('martingale');
      setStep('login');
    } catch (e) {
      addLog('Ошибка анализа. Проверьте ссылку.', 'info');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── LOGIN ──────────────────────────────────────────────
  const doLogin = async () => {
    if (!loginVal || !passVal) return;
    setLogging(true);
    setLoginErr('');
    try {
      const r = await fetch(API.agent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          login: loginVal,
          password: passVal,
          casino_url: link,
          session_id: sessionId,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Ошибка входа');
      setBalance(data.balance);
      setCurrency(data.currency);
      setUsername(data.username);
      setStep('play');
      addLog(`Вход выполнен. Баланс: ${data.balance.toLocaleString('ru')} ${data.currency}`, 'info');
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : 'Ошибка входа');
    } finally {
      setLogging(false);
    }
  };

  // ── PLAY ROUND ─────────────────────────────────────────
  const playRound = useCallback(async () => {
    if (!running$.current) return;
    try {
      const r = await fetch(API.agent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'play',
          session_id: sessionId,
          bet: bet[0],
          strategy,
          prev_bet: prevBet,
          consecutive_losses: consecutiveLosses,
        }),
      });
      const data = await r.json();
      if (data.error) { addLog(data.error, 'info'); setRunning(false); running$.current = false; return; }
      setBalance(data.balance);
      setPrevBet(data.bet);
      setConLoss(data.consecutive_losses);
      setStats(s => ({
        rounds: s.rounds + 1,
        wins:   s.wins + (data.won ? 1 : 0),
        losses: s.losses + (data.won ? 0 : 1),
        profit: s.profit + data.profit,
      }));
      const sign = data.won ? '+' : '−';
      const abs  = Math.abs(data.profit).toFixed(0);
      addLog(
        `Раунд #${data.round_num}: ${data.won ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ'} ${sign}${abs} ${currency}  (ставка ${data.bet})`,
        data.won ? 'win' : 'loss',
      );
    } catch { addLog('Ошибка раунда', 'info'); }
  }, [sessionId, bet, strategy, prevBet, consecutiveLosses, currency]);

  useEffect(() => {
    if (!running) return;
    running$.current = true;
    const t = setInterval(() => { if (running$.current) playRound(); }, 1600);
    return () => { running$.current = false; clearInterval(t); };
  }, [running, playRound]);

  const toggleRun = () => { if (running) { running$.current = false; setRunning(false); } else setRunning(true); };

  // ── CHAT ───────────────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMsgs(p => [...p, { role: 'user', text: msg }]);
    setChatLoading(true);
    try {
      const r = await fetch(API.chat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, session_id: sessionId }),
      });
      const data = await r.json();
      setChatMsgs(p => [...p, { role: 'ai', text: data.answer }]);
    } catch {
      setChatMsgs(p => [...p, { role: 'ai', text: 'Ошибка связи. Попробуй ещё раз.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMsgs]);

  const winRate = stats.rounds ? Math.round((stats.wins / stats.rounds) * 100) : 0;

  // ════════════════════════════════════════════════════════
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
              <h1 className="font-display font-bold text-xl tracking-wide leading-none">
                NEON<span className="text-primary">.AI</span>
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Casino Agent</p>
            </div>
          </div>

          {/* steps indicator */}
          <div className="hidden sm:flex items-center gap-1 text-xs">
            {(['analyze', 'login', 'play'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                  step === s ? 'bg-primary text-background' :
                  (['analyze','login','play'].indexOf(step) > i) ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'
                }`}>{i+1}</span>
                <span className={step === s ? 'text-foreground' : 'text-muted-foreground'}>
                  {s === 'analyze' ? 'Анализ' : s === 'login' ? 'Вход' : 'Игра'}
                </span>
                {i < 2 && <Icon name="ChevronRight" size={12} className="text-muted-foreground" />}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-full glass">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-primary animate-pulse' : step === 'play' ? 'bg-yellow-400' : 'bg-muted-foreground'}`} />
            <span className="text-xs text-muted-foreground">
              {running ? 'Агент играет' : step === 'play' ? username || 'Готов' : 'Ожидание'}
            </span>
          </div>
        </div>
      </header>

      <div className="container max-w-6xl py-10 space-y-8">

        {/* ── STEP 1: ANALYZE ── */}
        <section className="animate-fade-in">
          <div className="glass rounded-2xl p-6 neon-border">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Icon name="ScanSearch" size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg">Шаг 1 — Анализ казино</h2>
                <p className="text-xs text-muted-foreground">Вставьте ссылку или ID казино</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={link}
                onChange={e => setLink(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
                placeholder="https://1xbet.com  или  vulkan  или  ID-489201"
                className="bg-muted/40 border-border h-12 text-base"
                disabled={step !== 'analyze' && !!casino}
              />
              <Button
                onClick={step === 'analyze' || !casino ? analyze : () => { setCasino(null); setStep('analyze'); }}
                disabled={analyzing}
                className="h-12 px-6 font-semibold bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90 shrink-0"
              >
                {analyzing
                  ? <><Icon name="Loader2" size={18} className="animate-spin-slow mr-2" />Анализ...</>
                  : casino
                  ? <><Icon name="RefreshCw" size={18} className="mr-2" />Сменить</>
                  : <><Icon name="ScanSearch" size={18} className="mr-2" />Анализировать</>
                }
              </Button>
            </div>

            {casino && (
              <div className="mt-5 animate-fade-in">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { l: 'Казино', v: casino.name, i: 'Building2' },
                    { l: 'RTP',    v: `${casino.rtp}%`, i: 'Percent' },
                    { l: 'Игр',    v: casino.games.toLocaleString('ru'), i: 'Gamepad2' },
                    { l: 'Оценка', v: casino.grade, i: 'Award' },
                  ].map(c => (
                    <div key={c.l} className="bg-muted/30 rounded-xl p-3 border border-border/50">
                      <Icon name={c.i} size={15} className="text-primary mb-1.5" />
                      <p className="text-[11px] text-muted-foreground">{c.l}</p>
                      <p className="font-display font-semibold text-lg">{c.v}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 bg-primary/10 border border-primary/25 rounded-xl px-4 py-3 text-sm text-primary/90">
                  <Icon name="Brain" size={16} className="mt-0.5 shrink-0 text-primary" />
                  <p className="leading-relaxed">{aiComment}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── STEP 2: LOGIN ── */}
        {step !== 'analyze' && (
          <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className={`glass rounded-2xl p-6 ${step === 'login' ? 'neon-border' : 'opacity-80'}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center">
                  <Icon name="KeyRound" size={18} className="text-secondary" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg">Шаг 2 — Вход в казино</h2>
                  <p className="text-xs text-muted-foreground">Агент войдёт в {casino?.name} от вашего имени</p>
                </div>
                {step === 'play' && (
                  <span className="ml-auto text-xs px-3 py-1 rounded-full bg-primary/15 text-primary flex items-center gap-1">
                    <Icon name="CheckCircle2" size={13} /> Выполнен · {username}
                  </span>
                )}
              </div>
              {step === 'login' ? (
                <div className="space-y-3 max-w-md">
                  <Input
                    value={loginVal}
                    onChange={e => setLoginVal(e.target.value)}
                    placeholder="Логин / Email"
                    className="bg-muted/40 border-border h-11"
                  />
                  <Input
                    type="password"
                    value={passVal}
                    onChange={e => setPassVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doLogin()}
                    placeholder="Пароль"
                    className="bg-muted/40 border-border h-11"
                  />
                  {loginErr && (
                    <p className="text-destructive text-sm flex items-center gap-1">
                      <Icon name="AlertCircle" size={14} /> {loginErr}
                    </p>
                  )}
                  <Button
                    onClick={doLogin}
                    disabled={logging || !loginVal || !passVal}
                    className="h-11 px-6 font-semibold bg-gradient-to-r from-secondary to-accent text-white hover:opacity-90"
                  >
                    {logging
                      ? <><Icon name="Loader2" size={16} className="animate-spin-slow mr-2" />Подключаюсь...</>
                      : <><Icon name="LogIn" size={16} className="mr-2" />Войти и получить баланс</>
                    }
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Icon name="User" size={16} />
                  Аккаунт: <span className="text-foreground font-semibold">{username}</span>
                  <span className="ml-2">·</span>
                  <Icon name="Wallet" size={16} />
                  Начальный баланс получен
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── STEP 3: PLAY ── */}
        {step === 'play' && (
          <section className="grid lg:grid-cols-5 gap-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>

            {/* LEFT: settings */}
            <div className="lg:col-span-2 space-y-5">
              <div className="glass rounded-2xl p-5">
                <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                  <Icon name="Brain" size={16} className="text-secondary" /> Стратегия
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {STRATEGIES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStrategy(s.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        strategy === s.id
                          ? 'border-primary bg-primary/10 neon-border'
                          : 'border-border bg-muted/20 hover:border-muted-foreground/40'
                      }`}
                    >
                      <Icon name={s.icon} size={16} className={strategy === s.id ? 'text-primary' : 'text-muted-foreground'} />
                      <p className="font-semibold text-sm mt-1.5">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <Icon name="Coins" size={16} className="text-accent" /> Ставка
                  </h3>
                  <span className="font-display font-bold text-xl text-primary">{bet[0]} {currency}</span>
                </div>
                <Slider value={bet} onValueChange={setBet} min={50} max={2000} step={50} />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                  <span>50</span><span>2000</span>
                </div>
              </div>

              <Button
                onClick={toggleRun}
                className={`w-full h-13 py-3.5 text-base font-bold rounded-2xl transition-all ${
                  running
                    ? 'bg-destructive hover:bg-destructive/90 text-white'
                    : 'bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90'
                }`}
              >
                <Icon name={running ? 'Square' : 'Play'} size={20} className="mr-2" />
                {running ? 'Остановить агента' : 'Запустить автоигру'}
              </Button>
            </div>

            {/* RIGHT: balance + logs + chat */}
            <div className="lg:col-span-3 space-y-5">

              {/* Casino-style balance */}
              <div className="relative overflow-hidden rounded-2xl p-6 neon-border bg-gradient-to-br from-[hsl(240_28%_11%)] to-[hsl(240_30%_7%)]">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-secondary/20 blur-3xl pointer-events-none" />

                <div className="relative flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
                    <Icon name="Wallet" size={14} /> {casino?.name} · Счёт
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${
                    stats.profit >= 0 ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'
                  }`}>
                    <Icon name={stats.profit >= 0 ? 'ArrowUpRight' : 'ArrowDownRight'} size={12} />
                    {stats.profit >= 0 ? '+' : ''}{Math.round(stats.profit).toLocaleString('ru')} {currency}
                  </span>
                </div>

                <div className="relative flex items-baseline gap-2 mb-1">
                  <span className="font-display font-bold text-6xl tracking-tight text-gradient tabular-nums">
                    {balance !== null ? Math.round(balance).toLocaleString('ru') : '—'}
                  </span>
                  <span className="font-display text-3xl text-muted-foreground">{currency}</span>
                </div>
                <p className="relative text-[11px] text-muted-foreground mb-5 flex items-center gap-1.5">
                  <Icon name="CircleDollarSign" size={13} className="text-accent" />
                  Игровой счёт · ставка {bet[0]} {currency} · {STRATEGIES.find(s => s.id === strategy)?.name}
                </p>

                <div className="relative grid grid-cols-3 gap-2">
                  {[
                    { l: 'Раундов', v: stats.rounds, c: 'text-foreground' },
                    { l: 'Винрейт', v: `${winRate}%`, c: 'text-primary' },
                    { l: 'Победы/Пор', v: `${stats.wins}/${stats.losses}`, c: 'text-secondary' },
                  ].map(m => (
                    <div key={m.l} className="bg-background/40 rounded-xl p-3 text-center border border-border/50 backdrop-blur-sm">
                      <p className={`font-display font-bold text-2xl ${m.c}`}>{m.v}</p>
                      <p className="text-[11px] text-muted-foreground">{m.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Log */}
              <div className="glass rounded-2xl p-5">
                <h3 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
                  <Icon name="ScrollText" size={16} className="text-primary" /> Лента ходов
                  {running && <span className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />}
                </h3>
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <Icon name="Inbox" size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">Запустите автоигру — здесь появятся ходы в реальном времени</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map(l => (
                      <div key={l.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border animate-fade-in ${
                        l.type === 'win'  ? 'bg-primary/10 border-primary/30 text-primary' :
                        l.type === 'loss' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
                                            'bg-muted/30 border-border text-muted-foreground'
                      }`}>
                        <Icon name={l.type === 'win' ? 'CheckCircle2' : l.type === 'loss' ? 'XCircle' : 'Info'} size={15} />
                        {l.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Chat */}
              <div className="glass rounded-2xl p-5">
                <h3 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
                  <Icon name="MessageSquare" size={16} className="text-accent" /> ИИ-аналитик
                  <span className="text-[10px] text-muted-foreground ml-auto">спроси о стратегии или балансе</span>
                </h3>
                <div ref={chatRef} className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-3 scroll-smooth">
                  {chatMsgs.map((m, i) => (
                    <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role === 'ai' && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 mt-0.5">
                          <Icon name="Bot" size={14} className="text-background" />
                        </div>
                      )}
                      <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-primary/20 text-primary rounded-br-none'
                          : 'bg-muted/50 text-foreground rounded-bl-none'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-2 justify-start">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                        <Icon name="Bot" size={14} className="text-background" />
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-muted/50 text-muted-foreground text-sm flex items-center gap-1">
                        <Icon name="Loader2" size={14} className="animate-spin-slow" /> Думаю...
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                    placeholder="Спроси: какой мой баланс? лучшая стратегия?"
                    className="bg-muted/40 border-border h-10 text-sm"
                  />
                  <Button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading}
                    className="h-10 px-4 bg-accent/80 hover:bg-accent text-white shrink-0"
                  >
                    <Icon name="Send" size={16} />
                  </Button>
                </div>
              </div>

            </div>
          </section>
        )}
      </div>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        NEON.AI — ИИ-агент для анализа казино. Играйте ответственно.
      </footer>
    </div>
  );
}