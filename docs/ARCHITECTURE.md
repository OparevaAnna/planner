# ARCHITECTURE

Обновлять только при изменении архитектуры.

## Что это

Трекер «план vs факт»: план пишет десктопный OpenCode, факт собирается с телефона
через Telegram Mini App, вечером десктоп забирает факты и делает разбор.

- **Мобильный UI** — только сбор фактов. Без ИИ, без хвостов, без переноса задач.
- **Анализ и планирование** — только в OpenCode (CLI + скилл `daily-tracker`).
- **Один пользователь.** Публичной регистрации нет.

## Стек

| Слой | Технология |
|---|---|
| БД и auth | Supabase (PostgreSQL, RLS, Edge Functions) |
| Mini App | React + Vite + Tailwind, `@twa-dev/sdk` |
| Хостинг | GitHub Pages (статика) |
| Мост в OpenCode | `tools/tracker.mjs` (Node 20+, `@supabase/supabase-js`), `service_role` из `.env` |
| Скилл | `.opencode/skills/daily-tracker/SKILL.md` |

## Схема БД

```
app_config (1 строка)          — owner_auth_id, owner_telegram_id, timezone
daily_plans (PK plan_date)     — mode green|yellow|red, main_goal, first_step
daily_tasks                    — план + факт в одной строке
   status: planned|active|paused|done|skipped
   planned_time time, planned_minutes
   started_at, completed_at, actual_minutes, time_source: none|tracked|planned|fact
   category: work|study|sport|health|home|family|friends|rest|other
task_sessions                  — интервалы работы (старт/пауза/продолжение)
   minutes (generated), pause_reason; триггер пересчитывает actual_minutes
fact_logs                      — внеплановое и «паузы-дела»; task_id = откуда родилось
daily_summaries (PK date)      — числа дня + текст разбора от ИИ
v_day_facts, v_day_stats       — view для вечернего разбора (security_invoker)
```

## Решения, которые нельзя менять походя

1. **План и факт в одной строке.** `actual_minutes` = сумма `task_sessions`.
   Время паузы не принадлежит задаче: пауза вне сессий.
2. **«Готово» без «Начать»** → `actual_minutes = planned_minutes`,
   `time_source='planned'`. Конфликты времени разбирает `day:reconcile` на десктопе
   и переносит дело в ближайшее свободное окно (06:00–23:30) как факт
   (`time_source='fact'`).
3. **Пауза может стать делом:** `pause_task(as_fact=true)` сразу открывает
   `fact_logs` с текущего момента; `resume_task` закрывает его. Двойного счёта нет.
4. **Один таймер на всё** — частичные уникальные индексы `((1)) where ended_at is null`
   в `task_sessions` и `fact_logs`.
5. **RLS — единственная защита данных.** `anon` не имеет прав на таблицы.
   Политики: `is_owner()` = `auth.uid() = app_config.owner_auth_id`.
6. **Авторизация Mini App:** `initData` → Edge Function `tg-auth` (HMAC + auth_date 1 ч
   + сверка telegram id) → `generateLink(magiclink)` → обмен на сессию →
   `supabase.auth.setSession`. Дальше клиент ходит в PostgREST напрямую под RLS.

## Структура

```
Планировщик/
├── .env                 # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (не коммитить)
├── .opencodeignore
├── docs/                # ARCHITECTURE / TASKS / HANDOFF / DEPLOY
├── supabase/
│   ├── schema.sql       # схема целиком
│   ├── config.toml      # verify_jwt=false для tg-auth
│   └── functions/tg-auth/index.ts
├── tools/tracker.mjs    # CLI для OpenCode
├── tools/lib/time.mjs   # чистые функции времени и свободных окон
├── tmp/                 # обменные json (gitignore)
├── .github/workflows/deploy.yml
└── app/                 # Vite Mini App
    ├── index.html
    └── src/
        ├── App.jsx              # табы, список, шиты, таймер
        ├── lib/api.js           # auth, загрузка дня, RPC, категории
        ├── lib/supabase.js      # клиент (anon key)
        └── components/          # TaskCard, Sheets
```

Смежные файлы вне проекта: `C:\OpenCode\plan.md`, `C:\OpenCode\progress.md`,
`C:\OpenCode\AGENTS.md`, `.opencode/skills/*`.
