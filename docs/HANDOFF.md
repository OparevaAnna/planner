# HANDOFF

Обновлять в конце каждой завершённой задачи. Не длиннее 40 строк.

## Последний шаг
Этапы 0–2 пройдены: схема применена, CLI проверен на живой базе, Mini App собирается
(`npm run build` → 457 kB js / 130 kB gzip). На 16.11 в базе 14 задач.

## Где остановились
- CLI: `tools/tracker.mjs` — все команды рабочие, кроме `day:close` (не проверялся вживую).
- Проверка цикла на тестовой дате 2026-11-20 (данные удалены):
  start → pause(as fact) → resume → complete = 65 мин tracked, факт family 10 мин,
  «готово без старта» = 30 мин planned, `day:reconcile` перенёс конфликт и обнулил импутацию.
- Mini App: `app/src/{App.jsx,lib/api.js,components/*}`. Вход — `initTelegram → ensureAuth → loadDay`.
- Edge Function: `supabase/functions/tg-auth/index.ts` (HMAC initData + magiclink → сессия).
- Деплой не сделан: нет репозитория, функции и BotFather-приложения.

## Следующий шаг
1. `npx supabase login && npx supabase link --project-ref jciiwlrotsytquheaksh`
2. `npx supabase secrets set TELEGRAM_BOT_TOKEN=... ALLOWED_ORIGINS=https://<user>.github.io`
3. `npx supabase functions deploy tg-auth`
4. `gh repo create planner --public --source=. --push`, включить Pages → GitHub Actions,
   добавить `SUPABASE_URL`, `FUNCTIONS_URL` (variables) и `SUPABASE_ANON_KEY` (secret).
5. BotFather → `/newapp` → URL `https://<user>.github.io/planner/`.
Полный порядок — `docs/DEPLOY.md`.

## Известные ограничения
- Вне Telegram `initData` нет → приложение показывает ошибку (это правильное поведение).
- `day:reconcile` не поддерживает задачи через полночь.
- `task_sessions` показывает паузу как причину закрытия сессии; длительность паузы не пишется.
- Пуш в git не сделан — `.env` и `app/.env.local` в `.gitignore`.
