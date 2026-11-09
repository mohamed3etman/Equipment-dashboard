# حزمة تشغيل الـ42 إضافة لـ Claude Code

## الخلاصة

- **سكربت واحد** (`install.sh`) يركّب الـ42 على مراحل، وكل خطوة مستقلة: لو واحدة فشلت الباقي يكمل، وفي الآخر يطلع لك ملخص (نجح / اتخطّى / فشل).
- اتجرّب فعلياً على سيرفر Linux، والأسماء كلها اتأكدنا منها من مصادرها على GitHub (كل الـ16 مستودع موجودين، وأسماء الإضافات مطابقة).
- **حاجات مفعّلة عندك بالفعل** على حساب claude.ai ومش محتاجة تركيب: Gmail، Google Drive، Google Calendar، ElevenLabs، Python، Node.js، ffmpeg، Playwright (المتصفح).
- **حاجات محتاجة إيدك أنت** (مفتاح أو تسجيل دخول): موضحة في الجدول تحت.

## طريقة التشغيل على جهازك (Mac)

```bash
git clone https://github.com/mohamed3etman/Equipment-dashboard.git
cd Equipment-dashboard/claude-setup
./install.sh                # المرحلة الأساسية بس (الخمسة الأهم) — ابدأ بيها
./install.sh build design   # مراحل إضافية
./install.sh all            # الكل (مش منصوح بيه مرة وحدة)
```

بعد التركيب: افتح Claude Code واكتب `/reload-plugins`، وبعدين `/plugin` و`/mcp` و`/skills` عشان تتأكد.

المراحل: `core` · `build` · `design` · `research` · `content` · `office` · `extras` (مرحلة `prereq` بتشتغل لوحدها كل مرة وتركّب Node وPython وgh وffmpeg وuv لو ناقصين).

## حالة الـ42

| # | الإضافة | المرحلة | الحالة / المطلوب منك |
|---|---|---|---|
| 01 | Superpowers | core | ✅ تلقائي |
| 02 | gstack | build | ⚙️ محتاج Bun ‏1.4.2+ (`brew install oven-sh/bun/bun`) |
| 03 | graphify | build | ✅ تلقائي (محتاج uv) |
| 04 | GitHub CLI | core | 🔑 `gh auth login` أول مرة |
| 05 | Vercel | build | 🔑 `vercel login` أول مرة |
| 06 | Playwright | build | ✅ تلقائي |
| 07 | Codex | build | 🔑 محتاج حساب ChatGPT، وبعدها `/codex:setup` |
| 08 | Claude HUD | build | ✅ تلقائي، وبعدها `/claude-hud:setup` |
| 09 | Figma | design | 🔑 تسجيل دخول Figma أول استخدام |
| 10 | UI UX Pro Max | design | ✅ تلقائي |
| 11 | Impeccable | design | ✅ تلقائي |
| 12 | Taste Skill | design | ✅ تلقائي |
| 13 | emil-design-eng | design | ✅ تلقائي |
| 14 | HyperFrames | design | ✅ تلقائي |
| 15 | Remotion | design | ✅ تلقائي (ترخيص تجاري لو الشركة أكبر من 3 موظفين) |
| 16 | ffmpeg | prereq | ✅ تلقائي |
| 17 | Higgsfield | design | 💳 مدفوع ($15/شهر) |
| 18 | Perplexity | research | 💳🔑 مفتاح API مدفوع: `export PERPLEXITY_API_KEY=...` قبل التشغيل |
| 19 | Claude in Chrome | core | 👤 ركّب الإضافة من claude.com/chrome، وبعدها `claude --chrome` |
| 20 | Firecrawl | research | ✅ تلقائي (1000 رصيد مجاني) |
| 21 | Apify | research | 🔑 تسجيل دخول أول استخدام |
| 22 | last30days | research | ✅ تلقائي |
| 23 | Gemini CLI | research | 🔑 تسجيل دخول Google أول تشغيل |
| 24 | Humanizer | core | ✅ تلقائي |
| 25 | Metricool | research | 🔑 تسجيل دخول |
| 26 | GPT Image | content | 💳🔑 `OPENAI_API_KEY` في ‎~/.zshrc |
| 27 | Nano Banana | content | 🔑 `GEMINI_API_KEY` في ‎~/.zshrc |
| 28 | ElevenLabs | content | ✅ **متوصّل عندك بالفعل** |
| 29 | Puppeteer | content | ✅ تلقائي |
| 30 | Google Drive | — | ✅ **متوصّل عندك بالفعل** |
| 31 | Granola | content | 🔑 تسجيل دخول |
| 32 | Whisper | content | ✅ تلقائي (بيدعم العربي، محلي) |
| 33 | Python | prereq | ✅ موجود |
| 34 | Notion | office | 🔑 تسجيل دخول Notion |
| 35 | Gmail | — | ✅ **متوصّل عندك بالفعل** |
| 36 | Google Calendar | — | ✅ **متوصّل عندك بالفعل** |
| 37 | Slack | office | 🔑 تسجيل دخول Slack |
| 38 | Zapier | office | 🔑 تسجيل دخول Zapier |
| 39 | Caveman | extras | ⚠️ مش منصوح بيه (تحت) |
| 40 | find-skills | office | ✅ تلقائي |
| 41 | Node.js | prereq | ✅ موجود |
| 42 | Ollama | extras | ⚠️ اختياري (تحت) |

**المفاتيح:** ما تلصقش أي مفتاح API في المحادثة. حطّه في ‎`~/.zshrc` بالشكل ده، وبعدها افتح Terminal جديد:

```bash
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."
export PERPLEXITY_API_KEY="..."
```

## رأيي الصريح: ما تشغّلش الـ42 كلهم مرة وحدة

1. **التكلفة على الجودة:** كل إضافة بتحمّل وصفها في سياق كل محادثة. 42 إضافة معناها توكنز أكتر، وردود أبطأ، وكلود يحتار بين أدوات متشابهة (مثلاً عندك 4 أدوات تصميم و3 للتصفّح).
2. **الأمان:** المهارات والإضافات بتشتغل بصلاحياتك. الموصّلات (Gmail، Drive، Slack) بتقرا وبتكتب في حساباتك. كل واحدة زيادة = باب زيادة.
3. **الصلة بشغلك:** نصّ القائمة موجّه لمطوّرين وصنّاع محتوى فيديو. شغلك (استشارات، جودة، حوكمة، Makeen، لوحات تنفيذية) محتاج مجموعة أصغر.

**اللي أنصحك بيه لشغلك أنت:**

| الأولوية | الإضافات | ليه |
|---|---|---|
| فوراً | Superpowers، GitHub، Claude in Chrome، Gmail/Drive/Calendar (شغّالين) | الأساس |
| فوراً | Firecrawl، last30days، Notion | بحث سوق وتحليل منافسين لـ Makeen |
| فوراً | Whisper، Granola | تفريغ الاجتماعات (عربي) ومحاضرها |
| لما تحتاجها | Playwright، Vercel، UI UX Pro Max | لوحات وتطبيقات زي الداشبورد ده |
| تخطّاها | Caveman | بيختصر الردود بأسلوب ركيك، وده عكس اللي محتاجه في المخرجات التنفيذية والعربي |
| تخطّاها مبدئياً | Higgsfield، HyperFrames، Remotion، Metricool، Codex، gstack | فيديو وسوشيال وأدوات مطوّرين، مش من صلب شغلك دلوقتي |
| اختياري | Ollama | مفيد لو عندك بيانات مرضى/عملاء ما ينفعش تطلع برّا الجهاز |

يعني: `./install.sh core research` وبعدها `content` يغطّوا 80% من اللي محتاجه.
