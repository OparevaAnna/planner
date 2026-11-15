# TASKS

Чек-лист. `[x]` — сделано и проверено, `[ ]` — в работе или впереди.

## Этап 0 — фундамент
- [x] `supabase/schema.sql` (v2: сессии, паузы, 8 категорий, RLS, RPC)
- [x] Проект Supabase создан, схема применена, `app_config` заполнен
- [x] `.env`, `npm install`, `doctor` → `ok: true`
- [x] `tools/tracker.mjs` + `tools/lib/time.mjs`

## Этап 1 — мост OpenCode ↔ Supabase
- [x] `plan:push` на реальном плане (14 задач на 16.11 записаны)
- [x] `facts:get --md` — читаемый отчёт
- [x] `task:start → pause(as fact) → resume → complete` → 65 мин tracked + 10 мин факта
- [x] «Готово без старта» → 30 мин, `time_source='planned'`
- [x] `day:reconcile --apply` → конфликт перенесён в свободное окно, `time_source='fact'`, без двойного счёта
- [x] `day:close` на дне с висящим таймером → задача в `paused`, 90 мин сохранены, `daily_summaries` записан
- [ ] Скилл `daily-tracker` проверен в чате («выгрузи план», «забери факты»)
- [ ] Строка в `daily-plan/SKILL.md` (шаг 3.6) → выгрузка плана в Supabase
- [ ] Вечерний ритуал 22:00 на живом дне

## Этап 2 — Mini App MVP
- [x] `app/`: Vite + React + Tailwind v4 + `@twa-dev/sdk`, `npm run build` проходит
- [x] Экран «План»: карточки, время, категория, план/факт, live-таймер
- [x] «Начать» / «⏸ Пауза» (причина + чипы + «это дело») / «Продолжить» / «Готово»
- [x] Шит «Готово»: комментарий + энергия 1–5
- [x] Вкладка «Факты» + «+ Факт» (интервал, категория, комментарий)
- [x] `tg-auth` Edge Function написана, CORS по origin
- [x] `tg-auth` задеплоена: `401 no initData`, `bad signature` отбит, CORS пропускает `*.github.io`
- [x] Вход из Telegram работает, план читается
- [x] RLS проверен ключом `anon` из бандла: SELECT → `[]`, INSERT → 401, RPC → 401
- [ ] Проверка на телефоне: старт, пауза-дело, готово, +Факт
- [ ] Тема Telegram на живом устройстве (themeParams, safe-area, haptics)

## Этап 3 — деплой
- [ ] GitHub Actions → Pages (`.github/workflows/deploy.yml` готов)
- [ ] Variables/Secrets в репозитории
- [ ] BotFather: `/newapp` или `/setmenubutton`
- [ ] Проверка: `anon` не читает таблицы, вне Telegram — ошибка initData

## Этап 4 — вечерний ритуал (опционально)
- [ ] `pg_cron` + Edge Function напоминания в 22:00
- [ ] Авто-черновик плана на завтра в `plan.md`
