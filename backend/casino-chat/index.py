"""
ИИ-чат аналитик казино.
Отвечает на вопросы об игре, стратегиях, казино, текущей сессии.
Встроенная логика без внешних API-ключей.
"""
import json
import os
import psycopg2
import re

SCHEMA = "t_p18400856_casino_ai_agent"
DB_URL = os.environ["DATABASE_URL"]

KNOWLEDGE = {
    "мартингейл": "Мартингейл — удвоение ставки после каждого проигрыша. Плюс: быстрое отыгрывание потерь. Минус: требует большого банкролла, есть риск достичь лимита стола.",
    "фибоначчи": "Стратегия Фибоначчи использует последовательность чисел для размера ставок (1,1,2,3,5,8...). Более консервативна, чем мартингейл — ставки растут медленнее.",
    "флэт": "Флэт — фиксированная ставка в каждом раунде. Самая безопасная стратегия для длинных сессий. Лучше всего подходит для казино с высоким RTP (97%+).",
    "даламбер": "Д'Аламбер: +1 единица после проигрыша, -1 после выигрыша. Более плавная, чем мартингейл. Хороша при волатильности средней и ниже.",
    "rtp": "RTP (Return to Player) — процент возврата к игроку. RTP 97%+ отличный, 95-97% нормальный, ниже 95% — избегайте. Всегда выбирайте казино с высоким RTP.",
    "волатильность": "Волатильность — частота и размер выплат. Низкая: частые маленькие выигрыши. Высокая: редкие, но крупные. Для стабильной игры выбирайте низкую волатильность.",
    "банкролл": "Банкролл — ваш игровой бюджет. Правило: никогда не ставьте больше 2-5% банкролла в одном раунде. Это позволяет пережить серии проигрышей.",
    "ставка": "Размер ставки зависит от стратегии и банкролла. Для новичков: ставка = 1-2% от баланса. При балансе 10000₽ — ставка 100-200₽.",
    "лимит": "Установите лимит потерь (стоп-лосс) — например, 20% банкролла за сессию. Достигли лимита — остановились. Это защита от эмоциональных решений.",
    "как выиграть": "Гарантированного выигрыша нет — казино имеет математическое преимущество. ИИ-агент максимизирует шансы через оптимальную стратегию и управление банкроллом.",
    "лучшее казино": "По RTP и надёжности лидируют: Bet365 (97.5%), Bwin (97.3%), Pin-Up (97.1%), 888 Casino (97.0%). Проверяйте лицензию Мальты или Гибралтара.",
    "сколько выиграть": "Реальная цель — не «выиграть всё», а получить +5-15% за сессию и зафиксировать прибыль. Агент работает именно по этой логике.",
    "стратегия": "Лучшая стратегия зависит от казино. Для высокого RTP + низкой волатильности — флэт или мартингейл. Для высокой волатильности — фибоначчи или д'аламбер.",
}

GREETINGS = ["привет", "здравствуй", "хай", "добрый", "hello"]
THANKS = ["спасибо", "благодарю", "thanks", "спс"]


def find_answer(question: str, session_context: dict) -> str:
    q = question.lower().strip()

    if any(g in q for g in GREETINGS):
        return "Привет! Я ИИ-аналитик казино. Спрашивай о стратегиях, RTP, банкролле или текущей сессии — отвечу на всё!"

    if any(t in q for t in THANKS):
        return "Пожалуйста! Удачной игры — пусть агент работает в плюс 🎯"

    if any(w in q for w in ["баланс", "счёт", "сколько"]):
        bal = session_context.get("balance")
        if bal is not None:
            currency = session_context.get("currency", "₽")
            profit = session_context.get("total_profit", 0)
            sign = "+" if profit >= 0 else ""
            return f"Ваш текущий баланс: {bal:,.2f} {currency}. Прибыль за сессию: {sign}{profit:,.2f} {currency}. {'Агент в плюсе — хороший знак!' if profit >= 0 else 'Небольшой минус — это норма, стратегия отыгрывается постепенно.'}"

    if any(w in q for w in ["раунд", "сколько сыграл", "статистика", "результат"]):
        rounds = session_context.get("rounds", 0)
        wins = session_context.get("wins", 0)
        losses = session_context.get("losses", 0)
        if rounds > 0:
            wr = round(wins / rounds * 100)
            return f"Сыграно раундов: {rounds}. Победы: {wins}, Поражения: {losses}, Винрейт: {wr}%. {'Отличный результат!' if wr >= 50 else 'Стратегия продолжает адаптироваться.'}"
        return "Пока не сыграно ни одного раунда. Запустите агента!"

    for keyword, answer in KNOWLEDGE.items():
        if keyword in q:
            return answer

    if "стоп" in q or "остановить" in q:
        return "Чтобы остановить агента — нажмите кнопку 'Остановить' в панели управления. Зафиксируйте прибыль и выйдите из сессии."

    if "риск" in q or "опасно" in q:
        return "Любая игра в казино несёт риск. Агент минимизирует его через управление банкроллом и выбор оптимальной стратегии. Никогда не играйте на деньги, потеря которых критична."

    if "совет" in q or "рекомендация" in q:
        bal = session_context.get("balance", 0)
        profit = session_context.get("total_profit", 0)
        if profit > 0 and profit > bal * 0.1:
            return f"Совет: вы в плюсе {profit:,.0f} ₽. Рекомендую зафиксировать прибыль и завершить сессию — это правило успешных игроков."
        return "Совет: придерживайтесь выбранной стратегии, не меняйте ставку импульсивно. Дайте агенту сыграть минимум 20-30 раундов для стабилизации."

    return "Интересный вопрос! Уточни: тебя интересует стратегия, RTP казино, управление банкроллом или статистика текущей сессии? Спрашивай конкретнее — отвечу точнее."


def save_message(session_id: str, role: str, content: str):
    if not session_id:
        return
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO {SCHEMA}.chat_messages (session_id, role, content) VALUES (%s, %s, %s)",
        (session_id, role, content)
    )
    conn.commit()
    cur.close()
    conn.close()


def get_session_context(session_id: str) -> dict:
    if not session_id:
        return {}
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(
            f"SELECT balance, currency FROM {SCHEMA}.sessions WHERE session_id=%s", (session_id,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {}
        balance, currency = float(row[0]), row[1]
        cur.execute(
            f"SELECT COUNT(*), SUM(CASE WHEN result='win' THEN 1 ELSE 0 END), COALESCE(SUM(profit),0) "
            f"FROM {SCHEMA}.game_rounds WHERE session_id=%s", (session_id,)
        )
        stats = cur.fetchone()
        cur.close(); conn.close()
        return {
            "balance": balance,
            "currency": currency,
            "rounds": int(stats[0] or 0),
            "wins": int(stats[1] or 0),
            "losses": int(stats[0] or 0) - int(stats[1] or 0),
            "total_profit": float(stats[2] or 0),
        }
    except Exception:
        return {}


def handler(event: dict, context) -> dict:
    hdrs = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": hdrs, "body": ""}

    body = json.loads(event.get("body") or "{}")
    question = (body.get("message") or "").strip()
    session_id = body.get("session_id", "")

    if not question:
        return {"statusCode": 400, "headers": hdrs, "body": json.dumps({"error": "Пустой вопрос"})}

    ctx = get_session_context(session_id)
    answer = find_answer(question, ctx)

    save_message(session_id, "user", question)
    save_message(session_id, "assistant", answer)

    return {"statusCode": 200, "headers": hdrs, "body": json.dumps({
        "answer": answer,
        "session_context": ctx,
    }, ensure_ascii=False)}
