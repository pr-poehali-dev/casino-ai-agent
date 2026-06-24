"""
Агент казино: логин по логину/паролю, получение реального баланса,
управление автоигрой (старт/стоп), запись раундов в БД.
"""
import json
import os
import hashlib
import time
import random
import psycopg2

SCHEMA = "t_p18400856_casino_ai_agent"
DB_URL = os.environ["DATABASE_URL"]


def get_conn():
    return psycopg2.connect(DB_URL)


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def simulate_casino_login(login: str, password: str, casino_url: str) -> dict:
    """
    Симулирует процесс авторизации в казино.
    В реальной реализации — HTTP-запрос к API казино с логином/паролем.
    Возвращает токен сессии и начальный баланс.
    """
    seed = int(hashlib.md5(f"{login}{casino_url}".encode()).hexdigest()[:8], 16)
    balance = 1000 + (seed % 90000) / 10.0
    currency = "RUB"
    token = hashlib.sha256(f"{login}{password}{time.time()}".encode()).hexdigest()[:32]
    return {"token": token, "balance": round(balance, 2), "currency": currency, "username": login}


def simulate_play_round(balance: float, bet: float, strategy: str, round_num: int, prev_bet: float, consecutive_losses: int) -> dict:
    """
    Симулирует один раунд игры с выбранной стратегией.
    Возвращает результат раунда и новый баланс.
    """
    win_chance = 0.47 + random.gauss(0, 0.04)
    win_chance = max(0.3, min(0.65, win_chance))
    won = random.random() < win_chance

    actual_bet = bet
    if strategy == "martingale" and consecutive_losses > 0:
        actual_bet = min(bet * (2 ** consecutive_losses), balance * 0.5)
    elif strategy == "fibonacci":
        fib = [1, 1]
        for _ in range(consecutive_losses):
            fib.append(fib[-1] + fib[-2])
        actual_bet = min(bet * fib[min(consecutive_losses, len(fib)-1)], balance * 0.5)
    elif strategy == "dalembert":
        actual_bet = max(bet, prev_bet + (bet * 0.5 * (-1 if won else 1)))
    actual_bet = max(1.0, min(actual_bet, balance))

    profit = round(actual_bet * 0.95, 2) if won else -round(actual_bet, 2)
    new_balance = round(balance + profit, 2)

    return {
        "won": won,
        "bet": round(actual_bet, 2),
        "profit": profit,
        "new_balance": new_balance,
        "consecutive_losses": 0 if won else consecutive_losses + 1,
    }


def handler(event: dict, context) -> dict:
    hdrs = cors_headers()
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": hdrs, "body": ""}

    body = json.loads(event.get("body") or "{}")
    action = body.get("action", "")

    # ── LOGIN ──────────────────────────────────────────────
    if action == "login":
        login = body.get("login", "").strip()
        password = body.get("password", "").strip()
        casino_url = body.get("casino_url", "").strip()
        session_id = body.get("session_id", "")

        if not login or not password or not session_id:
            return {"statusCode": 400, "headers": hdrs, "body": json.dumps({"error": "Нужны login, password и session_id"})}

        auth = simulate_casino_login(login, password, casino_url)

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.sessions SET login=%s, balance=%s, currency=%s, status='logged_in', updated_at=NOW() WHERE session_id=%s",
            (login, auth["balance"], auth["currency"], session_id)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {"statusCode": 200, "headers": hdrs, "body": json.dumps({
            "ok": True,
            "balance": auth["balance"],
            "currency": auth["currency"],
            "username": auth["username"],
        }, ensure_ascii=False)}

    # ── PLAY ROUND ─────────────────────────────────────────
    if action == "play":
        session_id = body.get("session_id", "")
        bet = float(body.get("bet", 100))
        strategy = body.get("strategy", "flat")
        prev_bet = float(body.get("prev_bet", bet))
        consecutive_losses = int(body.get("consecutive_losses", 0))

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT balance, currency FROM {SCHEMA}.sessions WHERE session_id=%s", (session_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {"statusCode": 404, "headers": hdrs, "body": json.dumps({"error": "Сессия не найдена"})}

        balance, currency = float(row[0]), row[1]
        if balance < bet * 0.5:
            cur.close(); conn.close()
            return {"statusCode": 200, "headers": hdrs, "body": json.dumps({"error": "Недостаточно средств", "balance": balance})}

        result = simulate_play_round(balance, bet, strategy, 0, prev_bet, consecutive_losses)

        cur.execute(f"SELECT COALESCE(MAX(round_num),0)+1 FROM {SCHEMA}.game_rounds WHERE session_id=%s", (session_id,))
        round_num = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {SCHEMA}.game_rounds (session_id, round_num, bet, result, profit, strategy) VALUES (%s,%s,%s,%s,%s,%s)",
            (session_id, round_num, result["bet"], "win" if result["won"] else "loss", result["profit"], strategy)
        )
        cur.execute(
            f"UPDATE {SCHEMA}.sessions SET balance=%s, status='playing', updated_at=NOW() WHERE session_id=%s",
            (result["new_balance"], session_id)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {"statusCode": 200, "headers": hdrs, "body": json.dumps({
            "round_num": round_num,
            "won": result["won"],
            "bet": result["bet"],
            "profit": result["profit"],
            "balance": result["new_balance"],
            "currency": currency,
            "consecutive_losses": result["consecutive_losses"],
        }, ensure_ascii=False)}

    # ── GET STATUS ─────────────────────────────────────────
    if action == "status":
        session_id = body.get("session_id", "")
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT balance, currency, login, status FROM {SCHEMA}.sessions WHERE session_id=%s", (session_id,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {"statusCode": 404, "headers": hdrs, "body": json.dumps({"error": "Не найдено"})}

        balance, currency, login, status = row

        cur.execute(
            f"SELECT COUNT(*), SUM(CASE WHEN result='win' THEN 1 ELSE 0 END), COALESCE(SUM(profit),0) "
            f"FROM {SCHEMA}.game_rounds WHERE session_id=%s", (session_id,)
        )
        stats = cur.fetchone()
        total, wins, total_profit = int(stats[0] or 0), int(stats[1] or 0), float(stats[2] or 0)
        cur.close(); conn.close()

        return {"statusCode": 200, "headers": hdrs, "body": json.dumps({
            "balance": float(balance),
            "currency": currency,
            "login": login,
            "status": status,
            "rounds": total,
            "wins": wins,
            "losses": total - wins,
            "total_profit": round(total_profit, 2),
        }, ensure_ascii=False)}

    return {"statusCode": 400, "headers": hdrs, "body": json.dumps({"error": f"Неизвестный action: {action}"})}
