# HANDOFF

Обновлять в конце каждой завершённой задачи. Не длиннее 40 строк.

## Последний шаг
Этапы 0–2 пройдены: схема применена, CLI проверен на живой базе, Mini App собирается
(`npm run build` → 457 kB js / 130 kB gzip). На 16.11 в базе 14 задач.

## Где остановились
- CLI: `tools/tracker.mjs` — все команды проверены, включая `day:close`.
- Edge Function `tg-auth` задеплоена (v2 с нормализацией origin):
  `401 no initData`, поддельная подпись отбита, CORS отдаёт `*.github.io` и режет чужие.
- Mini App собран, но на телефоне ещё не открывался: нужны Pages + BotFather.
- Проверка цикла на тестовой дате 2026-11-20 (данные удалены):
  start → pause(as fact) → resume → complete = 65 мин tracked, факт family 10 мин,
  «готово без старта» = 30 мин planned, `day:reconcile` перенёс конфликт и обнулил импутацию.
- Mini App: `app/src/{App.jsx,lib/api.js,components/*}`. Вход — `initTelegram → ensureAuth → loadDay`.
- Edge Function: `supabase/functions/tg-auth/index.ts` (HMAC initData + magiclink → сессия).
- Деплой не сделан: нет репозитория, функции и BotFather-приложения.

## Следующий шаг
1. Открыть Mini App из бота на телефоне → должен подтянуться план на 16.11 (14 задач).
2. Проверить: «Начать» (таймер тикает) → «Пауза» + «это дело» → «Продолжить» → «Готово» с комментарием.
3. Сверить на ноутбуке: `node tools/tracker.mjs facts:get --date 2026-11-16 --md`.
4. Если вход падает — `npx supabase functions logs tg-auth` и проверить `ALLOWED_ORIGINS`.
5. Затем: добавить шаг 3.6 в `daily-plan/SKILL.md` (план → Supabase автоматически).

## Известные ограничения
- Вне Telegram `initData` нет → приложение показывает ошибку (это правильное поведение).
- `day:reconcile` не поддерживает задачи через полночь.
- `task_sessions` показывает паузу как причину закрытия сессии; длительность паузы не пишется.
- Пуш в git не сделан — `.env` и `app/.env.local` в `.gitignore`.
