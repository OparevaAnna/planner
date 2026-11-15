# DEPLOY — этап 3

## 1. Edge Function `tg-auth`

```bash
cd C:\OpenCode\Планировщик
npx supabase login                       # один раз
npx supabase link --project-ref jciiwlrotsytquheaksh
npx supabase secrets set TELEGRAM_BOT_TOKEN=<токен бота> ALLOWED_ORIGINS=https://<username>.github.io
npx supabase functions deploy tg-auth    # verify_jwt=false уже в config.toml
```

Проверка: `curl -i https://jciiwlrotsytquheaksh.supabase.co/functions/v1/tg-auth -X POST -H "Content-Type: application/json" -d '{}'`
→ `401 {"error":"no initData"}` (значит функция жива и проверка работает).

## 2. Anon-ключ для фронтенда

Supabase → Project Settings → API → `anon public` (это НЕ service_role).
Он попадёт в статику, это нормально: данные закрыты RLS.

## 3. GitHub Pages

```bash
cd C:\OpenCode\Планировщик
git init && git add -A && git commit -m "tracker: schema + cli + miniapp"
gh repo create planner --public --source=. --push
```

Репозиторий → Settings → Pages → Source: **GitHub Actions**.
Репозиторий → Settings → Secrets and variables → Actions:

| Тип | Имя | Значение |
|---|---|---|
| Variable | `SUPABASE_URL` | `https://jciiwlrotsytquheaksh.supabase.co` |
| Variable | `FUNCTIONS_URL` | `https://jciiwlrotsytquheaksh.supabase.co/functions/v1` |
| Secret | `SUPABASE_ANON_KEY` | anon public key |

`PAGES_BASE` подставляется из имени репозитория автоматически.
После первого прогона Actions приложение живёт на `https://<username>.github.io/planner/`.

Если `ALLOWED_ORIGINS` задан — только этот origin получит CORS (без слэша на конце).
Если не задан — разрешены все `*.github.io` и `localhost`.

## 4. BotFather

1. `/newapp` → выбрать бота → title `Планер` → описание → фото → **Web App URL**: `https://<username>.github.io/planner/` → short name `plan`.
2. Или `/setmenubutton` → выбрать бота → URL.
3. Открыть бота в Telegram → кнопка меню → приложение.

## 5. Проверка безопасности (обязательно)

```bash
curl "https://jciiwlrotsytquheaksh.supabase.co/rest/v1/daily_tasks?select=id" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

Ожидаемо: `[]` (RLS не пускает `anon`), а не список задач.
Если вернулись данные — политики не применились, выполнить `schema.sql` заново.

В обычном браузере (не Telegram) приложение должно показать «Нет Telegram initData».

## 6. .env локально (не коммитить)

`app/.env.local`:
```
VITE_SUPABASE_URL=https://jciiwlrotsytquheaksh.supabase.co
VITE_SUPABASE_ANON_KEY=<anon>
VITE_FUNCTIONS_URL=https://jciiwlrotsytquheaksh.supabase.co/functions/v1
```
`npm run dev` → туннель (cloudflared/ngrok) → открыть в Telegram, иначе `initData` не появится.
