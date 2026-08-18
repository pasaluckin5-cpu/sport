# Store listing copy

Draft copy for the App Store (App Store Connect) and Google Play (Play Console) listings.
Character limits are noted where the store enforces them — trim to fit your final app name.

## English

**App name** (App Store ≤30 / Play ≤30)
Swim Planner

**Subtitle** (App Store ≤30)
Personalized weekly swim plans

**Short description** (Play ≤80)
Personalized swim + gym training plans — or gym-only if you don't swim.

**Promotional text** (App Store ≤170, editable without a new build)
Tell it your level, schedule, and equipment — get a full week of swim sets and gym days built
to support your stroke, targeted to your own pace if you add a recent time trial.

**Full description** (≤4000)
Swim Planner builds a personalized weekly training plan from your swimming profile — no
subscription, no account, no ads.

Tell it:
- Your level and main goal — general fitness, endurance, speed, or technique
- How many pool sessions you want per week, and how long each one is
- Optional strength/gym sessions per week
- The equipment you actually own — fins, paddles, pull buoy, kickboard, snorkel, drag
  parachute, tempo trainer, ankle band
- Optionally, a recent time trial, so main-set paces are targeted to your real pace instead
  of a rough estimate

It builds a full week: warm-up, main set, and cool-down for every pool day, plus gym days
placed so a heavy leg day never lands right before a hard kick or sprint session. Those gym
days aren't generic — they're swim-specific dryland work (shoulder health, pulling strength,
explosive starts and turns, kick-range mobility, core/streamline control), each exercise
labeled with what it's actually for. Don't swim? Set pool sessions to 0 and get a standard
gym/fitness plan instead — no swimming required.

Choose meters or yards and your pool length (25 or 50), mark sessions complete as you go, and
back your profile up as text any time — everything stays on your device.

Available in English and Russian.

**Keywords** (App Store ≤100, comma-separated, no spaces needed)
swim,swimming,training,workout,plan,coach,pool,triathlon,fitness,gym,masters swimming,swim workout

**Category**
Health & Fitness

**Support URL**
Link to this repository (or your own support page/email).

**Privacy policy URL**
See "Privacy policy URL" in the main README for how to publish `docs/privacy-policy.html`.

---

## Russian (Русский)

**Название приложения** (≤30 символов)
Swim Planner

**Подзаголовок** (App Store, ≤30 символов)
Персональный план тренировок по плаванию

**Краткое описание** (Google Play, ≤80 символов)
Персональный план тренировок в бассейне и зале — или только зал, если не плаваете.

**Промо-текст** (App Store, ≤170 символов)
Укажите уровень, расписание и инвентарь — получите план на неделю с заплывами и тренировками
в зале, которые поддерживают вашу технику, а с недавним контрольным заплывом — ещё и с реальным темпом.

**Полное описание** (≤4000 символов)
Swim Planner составляет персональный план тренировок на неделю на основе вашего профиля
пловца — без подписки, без аккаунта, без рекламы.

Укажите:
- Свой уровень и основную цель — общая физподготовка, выносливость, скорость или техника
- Сколько тренировок в бассейне в неделю вам нужно и их длительность
- Тренировки в зале в неделю (по желанию)
- Инвентарь, который у вас есть — ласты, лопатки, колобашка, доска, трубка, парашют-тормоз,
  темп-тренер, резинка для ног
- По желанию — результат недавнего контрольного заплыва, чтобы темп в основных отрезках
  считался от вашей реальной скорости, а не приблизительно

Приложение строит полную неделю: разминка, основная часть и заминка для каждой тренировки в
бассейне, плюс тренировки в зале, расставленные так, чтобы тяжёлый день на ноги никогда не
предшествовал тяжёлой тренировке на скорость. Эти тренировки в зале — не общие упражнения, а
специальная подготовка пловца: здоровье плеч, сила гребка, взрывная сила для стартов и
поворотов, подвижность для работы ног, контроль кора и обтекаемости — у каждого упражнения
указано, для чего оно нужно. Не плаваете? Поставьте 0 тренировок в бассейне — и получите
обычный план тренажёрного зала, плавание не обязательно.

Выбирайте метры или ярды и длину бассейна (25 или 50), отмечайте тренировки выполненными и в
любой момент делайте резервную копию профиля текстом — все данные остаются на вашем устройстве.

Доступно на английском и русском языках.

**Ключевые слова**
плавание, тренировки, бассейн, план тренировок, тренер, фитнес, зал, триатлон, спортивное плавание

**Категория**
Здоровье и фитнес

## Screenshots

`docs/screenshots/` has a draft set (captured against the web build at a 390×844 viewport):

1. `01-empty-en.png` — empty state / onboarding prompt
2. `02-profile-en.png` — profile form filled in
3. `03-plan-en.png` — week view
4. `04-day-expanded-en.png` — a day expanded, showing warm-up/main/cool-down sets
5. `05-profile-ru.png` — profile form in Russian
6. `06-plan-ru.png` — week view in Russian

These are drafts, not final store assets: they're taken from the web build (so they carry
the web tab bar chrome and, in dev mode, Expo's dev-menu button in the corner) rather than a
real iOS/Android build, and stores expect exact per-device-size frames (e.g. 6.7" and 5.5"
for iPhone, various for Android). To produce final screenshots:

1. Build/run the actual native app (`npx eas-cli build --profile preview`, or a simulator/
   emulator) so the chrome matches what users will see, with no dev overlay.
2. Walk through the same flow: empty state → filled profile → week view → an expanded day →
   the Russian UI.
3. Capture with the simulator's/emulator's screenshot tool, or your OS screenshot tool, at
   each store's required device sizes.
