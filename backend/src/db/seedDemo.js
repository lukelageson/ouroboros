require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const pool = require('./pool');

const DEMO_EMAIL = 'demo@ouroboros.app';
const DEMO_PASSWORD = 'demo1234';
const DEMO_BIRTHDAY = '1988-07-14';

const BEAD_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e8c', '#ff6b35', '#c0392b',
  '#27ae60', '#2980b9', '#8e44ad', '#f39c12',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// ── Journal entries ────────────────────────────────────────────────────
// Spread across ~15 months ending near today (2026-03-15).
// Start from January 2025.

const entries = [
  // ── January 2025 ──
  { date: '2025-01-03', color: '#3498db', content: `New year, same apartment. I rearranged my desk so it faces the window now. Small thing but it changed how the whole room feels. Spent most of the day just sitting here watching snow fall and thinking about what I actually want this year to look like.` },
  { date: '2025-01-08', color: '#9b59b6', mood: 2, content: `Bad day at work. The project I spent three weeks on got shelved because leadership changed priorities again. I know it's normal but it's hard not to take it personally. Called Sarah after — she reminded me that I felt the same way last spring and it passed. She's right but still.` },
  { date: '2025-01-14', color: '#2ecc71', mood: 4, content: `Marcus and I went for a long walk along the river even though it was freezing. We talked about whether we're actually doing what we want to be doing or just following momentum. He's thinking about going back to school. I didn't say much but I've been turning the same question over in my head all week.` },
  { date: '2025-01-22', color: '#e67e22', content: `Started reading that book on ceramics my sister gave me for Christmas. I don't know anything about pottery but something about the way the author describes working with clay — how you have to respond to the material instead of forcing it — resonated with me. Maybe I should try making something with my hands.` },
  { date: '2025-01-29', color: '#1abc9c', content: `Quiet week. Cooked a lot. Made that lentil soup recipe three times trying to get it right. I think the trick is more cumin than you'd expect. Felt good to focus on something simple and immediate.` },

  // ── February 2025 ──
  { date: '2025-02-02', color: '#2980b9', content: `Lazy Sunday. Reorganized my bookshelf by color instead of author, which is impractical but looks incredible. Sometimes aesthetics matter more than function. Made coffee twice because the first cup got cold while I was arranging.` },
  { date: '2025-02-04', color: '#e74c3c', mood: 2, content: `Performance review was fine — "meets expectations" across the board. Which should feel okay but honestly it just made me wonder if I want to keep meeting these particular expectations. There's nothing wrong with my job but there's nothing pulling me forward either.` },
  { date: '2025-02-11', color: '#3498db', mood: 4, content: `Valentine's week. Not in a romantic way — Sarah organized a dinner for a bunch of us who are single or just wanted low-key company. We made pasta from scratch and it was genuinely one of the best nights I've had in months. Sometimes friendship is the whole point.` },
  { date: '2025-02-19', color: '#f1c40f', content: `Snow day. Worked from home and spent lunch staring out the window again. I keep coming back to this idea of making something — a project outside of work. Nothing specific yet. Just the pull toward creating rather than maintaining.` },
  { date: '2025-02-25', color: '#27ae60', mood: 4, content: `My sister visited for the weekend. We went to that ceramics studio downtown and I actually threw my first pot. It was terrible — lopsided and too thick — but the feeling of wet clay spinning under my hands was incredible. I think I'm going to sign up for the beginner class.` },

  // ── March 2025 ── (creative project starts)
  { date: '2025-03-02', color: '#f39c12', mood: 5, content: `Signed up for the pottery class. Six weeks, Tuesday evenings. First session was mostly wedging clay and learning about the wheel. The instructor said something that stuck with me: "The pot already exists in the clay. Your job is to find it." I know it's a little cheesy but I keep thinking about it.` },
  { date: '2025-03-09', color: '#e91e8c', mood: 4, content: `Second pottery class. Made a small bowl that actually looks like a bowl. The glazing options are overwhelming — so many colors. I chose a deep blue-green that reminded me of the ocean. Won't see the finished piece for two weeks though. The waiting is part of it.` },
  { date: '2025-03-16', color: '#8e44ad', content: `Work is fine. That word again — fine. Had a meeting about next quarter's goals and I couldn't bring myself to care about any of them. I know I should be more engaged but Tuesday evenings at the studio are the only hours that feel like mine lately.` },
  { date: '2025-03-22', color: '#2ecc71', mood: 4, content: `Got my first glazed bowl back. The blue-green came out darker than I expected but it's beautiful in its own way. I eat cereal out of it now. There's something deeply satisfying about using something you made with your own hands. Marcus said it looks like a dog bowl. He's not wrong.` },
  { date: '2025-03-30', color: '#3498db', mood: 3, content: `End of the month. Been thinking a lot about direction. Where am I headed? Not in a crisis way, more like standing at a crossroads and all the signs are blank. The pottery helps — it's something concrete (well, ceramic) in a life that feels abstract. Sarah says I'm overthinking it. Probably.` },

  // ── April 2025 ──
  { date: '2025-04-02', color: '#ff6b35', mood: 3, content: `Woke up at 4am with this knot of anxiety about nothing specific. Lay there cataloguing everything in my life — job, apartment, relationships, hobbies — and none of it felt wrong exactly. It's more like I'm wearing someone else's well-fitting clothes. Everything fits but nothing is mine.` },
  { date: '2025-04-05', color: '#2ecc71', mood: 4, content: `Spring finally. The trees outside my window are starting to bud. Went for a run for the first time since November and it was brutal but the air smelled like wet earth and possibility. Dramatic? Sure. But that's how it felt.` },
  { date: '2025-04-12', color: '#f1c40f', mood: 5, content: `Pottery class finale. I made a set of four mugs that I'm genuinely proud of. They're not perfect — slightly different sizes, one handle is a little crooked — but they're mine. Gave one to Sarah, one to Marcus. Keeping two. The instructor said I have a good instinct for form. That might be the nicest thing anyone's said to me in a while.` },
  { date: '2025-04-18', color: '#e67e22', content: `The class ended and now Tuesday evenings are empty again. Looked into intermediate classes but they don't start until fall. I could practice at the open studio hours but it's not the same without the structure. Feeling that familiar drift.` },
  { date: '2025-04-25', color: '#9b59b6', mood: 4, content: `Dinner at my sister's place. Her kids are getting so big. My nephew asked me what I do for work and I realized I couldn't explain it in a way that makes sense to a seven-year-old. "I help companies organize their information" got a blank stare. Fair enough, kid.` },

  // ── May 2025 ──
  { date: '2025-05-02', color: '#1abc9c', mood: 4, content: `Beautiful weekend. Sat in the park with a book and didn't look at my phone for three hours. Read almost the whole thing — a novel about a lighthouse keeper. Something about solitude as a choice rather than a circumstance. Felt very relevant.` },
  { date: '2025-05-10', color: '#e74c3c', mood: 2, content: `Career anxiety is back. A colleague my age just got promoted to a role I didn't even know existed. I'm not jealous exactly — I don't want their job — but it highlighted how long I've been standing still. What am I building toward? I genuinely don't know.` },
  { date: '2025-05-17', color: '#3498db', content: `Sarah's birthday party. She turned 35 and seemed genuinely happy about it. "I finally feel like I know who I am," she said. I smiled and meant it for her but inside I thought: I'm 36 and I'm still figuring that out. Different timelines I guess.` },
  { date: '2025-05-24', color: '#27ae60', mood: 4, content: `Started biking to work now that the weather's nice. Twenty minutes each way and it completely changes my mood. Arrived at my desk this morning actually looking forward to the day. Fresh air is underrated as a productivity tool.` },
  { date: '2025-05-31', color: '#f39c12', content: `End of May. Marcus invited me to join a weekend hiking group he found. I said yes before I could talk myself out of it. First hike is next Saturday. I need to buy actual hiking boots apparently.` },

  // ── June 2025 ──
  { date: '2025-06-03', color: '#2980b9', mood: 4, content: `Sarah and I tried that new ramen place downtown. Way too much food but worth it. She's been promoted at her firm and she's handling it with that effortless confidence she has. Walking home after, the city felt alive — music from open windows, people on stoops. Summer in the city is something else.` },
  { date: '2025-06-07', color: '#2ecc71', mood: 5, content: `First hike with Marcus's group. Eight miles through the state park. My feet are destroyed but the view from the ridge was worth every blister. Met some interesting people — a teacher, a nurse, a guy who builds furniture. Nobody talked about corporate strategy once. It was wonderful.` },
  { date: '2025-06-14', color: '#e67e22', content: `Long days now. Light until almost 9pm. I've been sitting on my fire escape after dinner just watching the neighborhood. Kids playing, people walking dogs, the ice cream truck making its rounds. Ordinary life. I forget sometimes that ordinary can be enough.` },
  { date: '2025-06-21', color: '#f1c40f', mood: 4, content: `Summer solstice. Longest day of the year and I spent it well — morning run, good work session, evening bike ride along the canal. Felt fully in my body for the first time in a while. My sister called to tell me she's pregnant again. Third kid. She sounds happy and exhausted, which seems about right.` },
  { date: '2025-06-28', color: '#1abc9c', content: `Quarterly planning at work. They want me to lead a new initiative around data migration. It's more responsibility and I should be excited but mostly I feel tired. Said yes anyway. What else was I going to say?` },

  // ── July 2025 ── (summer, pottery absent)
  { date: '2025-07-01', color: '#f1c40f', mood: 3, content: `First of July. Summer is wide open and I don't have plans, which is either freedom or emptiness depending on the hour. Cleaned the whole apartment and rearranged the living room. The pottery bowl lives on the kitchen windowsill now where the morning light hits it. Small comforts.` },
  { date: '2025-07-04', color: '#e74c3c', mood: 4, content: `Fourth of July at Marcus's rooftop. Fireworks over the river. Sarah brought her new girlfriend and they seem really good together. Ate too many hot dogs. Felt patriotic in the way where you love the people around you more than any abstract idea.` },
  { date: '2025-07-12', color: '#ff6b35', content: `Work has been consuming. The data migration project is bigger than anyone estimated and I'm the one holding the timeline together. Late nights, weekend emails. I haven't biked to work in two weeks. Haven't done much of anything except work and sleep.` },
  { date: '2025-07-14', color: '#f39c12', mood: 3, content: `My birthday. 37. My sister sent a cake. Marcus and Sarah took me to that Thai place we like. Blew out a candle on a slice of mango sticky rice. Made a wish I'm not going to write down. Good day overall but birthdays always make me take stock, and the inventory is... complicated.` },
  { date: '2025-07-23', color: '#9b59b6', mood: 2, content: `Can't sleep. Lying here at 2am thinking about five years from now. Will I still be doing this? "This" meaning my job, this city, this life. I don't hate any of it but I don't feel pulled toward it either. I keep waiting for clarity that doesn't come. Maybe clarity isn't something that arrives. Maybe you have to build it.` },
  { date: '2025-07-30', color: '#3498db', content: `Took a day off and went to the lake by myself. Floated on my back and stared at the sky for an hour. Didn't think about work. Didn't think about direction or purpose or what I'm doing with my life. Just floated. It was perfect.` },

  // ── August 2025 ──
  { date: '2025-08-02', color: '#f39c12', content: `Hot weekend. Stayed inside with the blinds drawn and rewatched a documentary about Japanese woodworkers. The patience they have — spending decades perfecting one type of joint. I don't have that patience but I admire it. Maybe admiring it is the first step toward having it.` },
  { date: '2025-08-06', color: '#2ecc71', mood: 4, content: `The data migration shipped. Not perfectly — there's a cleanup phase coming — but the hard part is done. My manager said "great job" in the team meeting and I felt absolutely nothing. That should probably concern me more than it does.` },
  { date: '2025-08-13', color: '#e67e22', mood: 3, content: `Hiking again after a month off. Different trail this time — more elevation, fewer people. Marcus and I got ahead of the group and had one of those rare honest conversations. He's decided to apply for grad school. Urban planning. When he talked about it his face lit up in a way I recognized from when I talk about pottery. I miss that feeling.` },
  { date: '2025-08-20', color: '#c0392b', mood: 2, content: `Bad week. Everything feels slightly off — like wearing shoes on the wrong feet. Work is fine. Apartment is fine. I'm fine. But "fine" is starting to feel like a trap. My sister keeps asking if I'm okay and I keep saying yes and we both know it's not the whole truth.` },
  { date: '2025-08-28', color: '#1abc9c', content: `Late August. The light is already changing — golden hour comes earlier, shadows are longer. I love this time of year even though it makes me melancholy. Ordered some art supplies on impulse. Charcoal pencils and a sketchpad. Who knows.` },

  // ── September 2025 ──
  { date: '2025-09-01', color: '#e67e22', content: `Labor Day. Grilled at my sister's place. The kids ran through sprinklers while the adults talked about nothing important. My brother-in-law asked about work and I gave my standard non-answer. My sister caught my eye across the yard. She knows.` },
  { date: '2025-09-03', color: '#8e44ad', mood: 3, content: `First day of September and it already feels like fall. Cool mornings, warm afternoons. I drew for the first time in years — nothing ambitious, just the view from my window. The trees, the rooftops, the water tower. It was bad but it was something. My hands remembered more than I expected.` },
  { date: '2025-09-10', color: '#3498db', mood: 2, content: `Annual review cycle is starting and I have to write my self-assessment. Trying to articulate my "career aspirations" for the fifth year in a row. Each year the answer gets vaguer. I used to want to be a director. Now I just want to want something clearly.` },
  { date: '2025-09-18', color: '#f1c40f', mood: 4, content: `Sarah and I went apple picking upstate. Came home with way too many apples and spent the evening making pie. Hers was beautiful. Mine looked like a geological event. Tasted good though. We talked about her relationship and she's really happy. It's nice to watch someone you love be happy.` },
  { date: '2025-09-25', color: '#e74c3c', mood: 3, content: `Fall is here. I can feel it in my bones — that shift toward introspection. Pulled out my pottery bowl this morning and just held it. Thought about how I felt making it. That focus, that presence. I want more of that in my life. The intermediate pottery class starts in two weeks. I already signed up.` },

  // ── October 2025 ── (creative project returns)
  { date: '2025-10-02', color: '#f39c12', mood: 4, content: `First intermediate pottery class. Harder than I remembered — we're doing lidded vessels now, which require precision I haven't developed yet. My lid didn't fit my pot even slightly. But being back at the wheel felt like coming home. The clay doesn't care about your career aspirations. It just wants you to pay attention.` },
  { date: '2025-10-09', color: '#27ae60', mood: 5, content: `Made a lidded jar that actually closes. The instructor said my centering has improved. Such a simple compliment but I carried it around all day like a gift. After class I sat in the parking lot for ten minutes just feeling good. When was the last time work made me feel that way? I can't remember.` },
  { date: '2025-10-16', color: '#9b59b6', content: `Marcus got into grad school. He starts in January. I'm thrilled for him and also aware of this quiet jealousy — not of the school itself but of the certainty. He found his thing. He made a decision and went after it. I'm still circling.` },
  { date: '2025-10-22', color: '#2ecc71', mood: 4, content: `Autumn colors are peaking. Biked through the park on my way home and the trees were on fire — reds, oranges, yellows. Stopped to take a photo and then put my phone away and just looked. Some things are better as memories than images.` },
  { date: '2025-10-30', color: '#e67e22', mood: 4, content: `Halloween prep at my sister's house. Helped the kids carve pumpkins. My nephew wanted a "scary dinosaur" which is challenging on a round surface but we made it work. My sister pulled me aside after and said she's worried about me. I told her I'm figuring things out. She said "you've been figuring things out for two years." Ouch. But fair.` },

  // ── November 2025 ──
  { date: '2025-11-02', color: '#e67e22', mood: 3, content: `Daylight savings ended. Lost an hour of evening light and gained an hour of morning I'll never use. Made soup and bread from scratch — the apartment smelled incredible all afternoon. Texted Sarah a photo and she showed up twenty minutes later with wine. That's friendship.` },
  { date: '2025-11-05', color: '#c0392b', mood: 2, content: `Dark at 5pm now. The seasonal shift always hits me harder than I expect. Pottery is the bright spot — I'm working on a series of small cups. Each one slightly different. The repetition is meditative. Make a cup, make another cup. Each one teaches you something the last one didn't.` },
  { date: '2025-11-12', color: '#3498db', content: `Had coffee with an old college friend who left tech to become a therapist. She said something that stuck: "You don't have to know what you want. You just have to notice what you keep coming back to." I keep coming back to making things. That probably means something.` },
  { date: '2025-11-19', color: '#e74c3c', mood: 2, content: `Work drama. Restructuring rumors. Nobody knows what's happening but everyone's anxious. I realized I'm less worried about losing my job than I am about keeping it. What does that tell you? Had a long phone call with my sister about it. She said maybe the universe is trying to tell me something. I don't believe in that kind of thing but the timing is suspicious.` },
  { date: '2025-11-27', color: '#f1c40f', mood: 4, content: `Thanksgiving at my sister's. The kids made place cards with crayon drawings of each person. Mine had a giant head and tiny arms. Accurate. The food was good, the company was better. Marcus came too — his family is all in Portland. Sarah FaceTimed from her girlfriend's parents' place. Grateful for these people. That's not nothing.` },

  // ── December 2025 ──
  { date: '2025-12-03', color: '#9b59b6', mood: 3, content: `Made holiday gifts at the studio — a mug for Sarah, a small planter for Marcus, a set of ornaments for my sister's tree. Glazing them in different colors. There's something about making gifts instead of buying them. It takes longer but it means more. At least it does to me.` },
  { date: '2025-12-10', color: '#1abc9c', content: `Year-end reflections starting early. I keep making lists — things I did, things I didn't, things I want. The "things I want" list is always the shortest and the hardest. I want to make things. I want to feel engaged. I want to stop saying "fine" when people ask how I am. Is that specific enough? Probably not.` },
  { date: '2025-12-18', color: '#e91e8c', mood: 4, content: `Office holiday party. Sarah surprised me by wearing the earrings I didn't know her girlfriend had made. Matching energy. Danced badly, laughed a lot. My manager mentioned they're creating a new creative director role in Q1. "You should think about it," she said. I don't know if I want to direct more of the same or go do something completely different.` },
  { date: '2025-12-25', color: '#f39c12', mood: 4, content: `Christmas morning at my sister's. The kids were up at 5:30am. My nephew loved the ornaments — hung them on the tree immediately. Watched him arrange and rearrange them with total concentration. That's how I feel at the wheel. Complete focus, no self-consciousness. When do we lose that? Can we get it back?` },
  { date: '2025-12-28', color: '#2980b9', mood: 3, content: `Between Christmas and New Year's. That strange liminal week where nothing feels real. Went to the studio and made pieces without any plan — just shapes. A twisted column. A shallow dish with an uneven rim. Sometimes the best work comes when you stop trying to make something specific and just let your hands move.` },
  { date: '2025-12-31', color: '#2ecc71', mood: 3, content: `Last day of the year. Marcus, Sarah, and I did our annual tradition — dinner at the diner, then walk across the bridge at midnight. Marcus leaves for school in three weeks. Things are shifting. I told them both about the creative director role and neither of them said "that's perfect for you." That silence told me everything.` },

  // ── January 2026 ──
  { date: '2026-01-04', color: '#3498db', content: `New year. I didn't make resolutions, I made one decision: apply for the creative director role but also start looking at what else is out there. Not quitting, just... opening doors. Spent the morning updating my resume and realized half my accomplishments feel like they belong to someone else.` },
  { date: '2026-01-11', color: '#e67e22', mood: 2, content: `Marcus left for school. Helped him pack his apartment. When we hugged goodbye I almost cried which surprised both of us. He said "go find your thing" and I nodded like I knew what he meant. The apartment building is quieter without him. The hiking group already feels different.` },
  { date: '2026-01-18', color: '#8e44ad', mood: 4, content: `Pottery class started a new session. We're doing larger pieces now — vases, pitchers. My first vase collapsed twice before I got the walls right. The instructor said "failure is just the clay telling you to listen harder." I wrote it on a sticky note and put it on my monitor at work.` },
  { date: '2026-01-25', color: '#ff6b35', mood: 3, content: `Interview for the creative director role. It went... fine. They asked where I see myself in five years and I gave the answer they wanted, not the honest one. The honest one is: I don't know, but I hope I'm making something real with my hands. That doesn't go over well in corporate interviews.` },
  { date: '2026-01-30', color: '#1abc9c', content: `Video call with Marcus. He's loving school — talking a mile a minute about zoning laws and public spaces. His enthusiasm is contagious. Told him about the interview. He said "do you want the job or do you want to want the job?" That's the question, isn't it.` },

  // ── February 2026 ──
  { date: '2026-02-05', color: '#e74c3c', mood: 2, content: `Didn't get the creative director role. They went with someone external. My manager was apologetic. I should be disappointed but honestly I felt relief, which is its own kind of answer. Sat in my car in the parking lot for twenty minutes after she told me. Not crying, not angry. Just sitting with the relief and what it means.` },
  { date: '2026-02-12', color: '#2ecc71', mood: 4, content: `Valentine's Day dinner tradition with Sarah again. Her girlfriend joined this year, which changed the dynamic but in a good way. We made ravioli from scratch. My filling was better than my pasta. Sarah asked what I'm going to do now that the promotion fell through. "Something different," I said. First time I've said it out loud.` },
  { date: '2026-02-18', color: '#f1c40f', content: `Started looking at ceramics programs. Actual programs — certificate courses, apprenticeships. There's one at the arts center that's six months, three days a week. You have to submit a portfolio and interview. My hands started sweating just reading the application. That's either terror or excitement. Maybe they're the same thing.` },
  { date: '2026-02-24', color: '#9b59b6', mood: 4, content: `My sister came over and I showed her the ceramics program website. She got quiet for a minute and then said "I've been waiting for you to find this." Apparently everyone could see it but me. She helped me photograph my pottery pieces for the portfolio. Under good lighting, they actually look like real work. Because they are.` },
  { date: '2026-02-28', color: '#27ae60', mood: 5, content: `Submitted the application. Portfolio of twelve pieces, artist statement, interview request. My hands were shaking when I clicked send. Then I went to the studio and threw the best pot I've ever made — tall, symmetrical, thin-walled. Sometimes your body knows the answer before your brain does.` },

  // ── March 2026 ──
  { date: '2026-03-01', color: '#c0392b', mood: 3, content: `Ten years at my job today. A decade. Sarah sent flowers to my desk which was sweet and also made me want to cry. Ten years of fine. I used to think loyalty was a virtue but now I wonder if it was just inertia. The ceramics program would start in September. That's six months to plan a transition. Or six months to lose my nerve.` },
  { date: '2026-03-04', color: '#3498db', mood: 4, content: `Called Marcus to tell him about the ceramics application. He literally cheered. "Finally," he said. We talked for an hour about reinvention and how scary it is to take yourself seriously. He's so much happier in school than he ever was at his old job. That gives me hope.` },
  { date: '2026-03-08', color: '#e67e22', content: `Work feels different now. Not bad, just... temporary. Like I'm already leaving even though nothing has happened yet. Finished a project today and instead of satisfaction I felt impatience. Is that unfair to the people I work with? Probably. But I can't unsee what I've seen about myself.` },
  { date: '2026-03-12', color: '#f39c12', mood: 4, content: `Interview for the ceramics program tomorrow. Laid out my portfolio pieces on the kitchen table and just looked at them. Seven months of Tuesday evenings and open studio Saturdays. Each piece holds a feeling — the wobbly first bowl, the too-dark glaze, the set of holiday mugs. They tell a story. My story. Whatever happens tomorrow, this path is mine.` },
  { date: '2026-03-14', color: '#2ecc71', mood: 5, content: `The interview went well. Really well. The program director picked up each piece and asked me about it and I talked about clay and attention and presence and she just nodded. She said they're looking for people who treat the medium as a practice, not a hobby. "You already do," she said. I'll hear back in two weeks. For the first time in a long time, I want something clearly.` },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Upsert demo user ──────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    let userResult = await client.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL]);
    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      await client.query('UPDATE users SET password_hash = $1, birthday = $2 WHERE id = $3', [passwordHash, DEMO_BIRTHDAY, userId]);
      // Delete existing entries and analyses for this user only
      await client.query('DELETE FROM analyses WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM entries WHERE user_id = $1', [userId]);
      console.log('Reset existing demo user:', userId);
    } else {
      userResult = await client.query(
        'INSERT INTO users (email, password_hash, birthday) VALUES ($1, $2, $3) RETURNING id',
        [DEMO_EMAIL, passwordHash, DEMO_BIRTHDAY]
      );
      userId = userResult.rows[0].id;
      console.log('Created demo user:', userId);
    }

    // ── Insert milestones ─────────────────────────────────────────────
    const milestones = [
      { date: '2006-06-10', label: 'High school graduation', color: '#f5a623' },
      { date: '2010-08-22', label: 'Moved into my first apartment', color: '#f5a623' },
      { date: '2015-03-01', label: 'Started my current job', color: '#f5a623' },
    ];

    for (const m of milestones) {
      await client.query(
        `INSERT INTO entries (user_id, content, color, entry_date, is_milestone, milestone_label)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [userId, m.label, m.color, m.date, m.label]
      );
    }
    console.log('Inserted', milestones.length, 'milestones');

    // ── Insert journal entries ─────────────────────────────────────────
    for (const e of entries) {
      await client.query(
        `INSERT INTO entries (user_id, content, color, mood, entry_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, e.content, e.color, e.mood || null, e.date]
      );
    }
    console.log('Inserted', entries.length, 'journal entries');

    await client.query('COMMIT');
    console.log('\nDemo account seeded successfully.');
    console.log('  Email:    ', DEMO_EMAIL);
    console.log('  Password: ', DEMO_PASSWORD);
    console.log('  Birthday: ', DEMO_BIRTHDAY);
    console.log('  Entries:  ', entries.length + milestones.length, `(${milestones.length} milestones + ${entries.length} journal)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
