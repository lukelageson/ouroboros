require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const pool = require('./pool');

const DEMO_EMAIL    = 'demo@ouroboros.app';
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
// Full arc: March 2015 (first day at current job) → March 2026.
// ~200 entries across 11 years. Story follows one character's slow
// drift from early career optimism toward a mid-life creative reckoning.
// Friends introduced: Sarah (colleague, then close friend), Marcus (hiking buddy, 2022).
// Sister (Elena) has two kids by 2025, third on the way.

const entries = [

  // ══════════════════════════════════════════════════════
  // 2015 — New city, new job, raw optimism
  // ══════════════════════════════════════════════════════

  { date: '2015-03-03', color: '#3498db', mood: 5, content: `First day. The office is open-plan and a little loud but in an energetic way, not a chaotic way. My desk is by a window that looks out at the street. I keep catching myself smiling. This feels like the beginning of something. I want to remember this feeling exactly.` },
  { date: '2015-03-14', color: '#2ecc71', mood: 4, content: `Two weeks in and I'm starting to get the shape of things. The team is smart and collaborative. My manager, David, actually reads the briefs before meetings. That sounds like a low bar but at my last place it was apparently aspirational. Optimistic.` },
  { date: '2015-04-08', color: '#f1c40f', mood: 4, content: `Moved my plants into the office window. Three succulents and a trailing pothos. Someone left a note on my desk saying "love the plants." That's how I met Sarah — she was the one who left the note. We got coffee and talked for an hour about houseplants and ended up talking about everything else.` },
  { date: '2015-05-02', color: '#9b59b6', mood: 4, content: `First real project shipped. A data audit that took six weeks and involved more spreadsheets than I knew existed. David presented it to leadership and gave me full credit, which he didn't have to do. That gesture meant a lot. I'm in the right place.` },
  { date: '2015-06-20', color: '#e67e22', content: `Long weekend trip to the coast with coworkers. We rented a house that was slightly too small and slightly too far from the beach but it was perfect anyway. I swam in the ocean for the first time in years. The cold water felt like waking up.` },
  { date: '2015-07-14', color: '#f39c12', mood: 4, content: `Twenty-seven. The birthday where you start to feel like an actual adult. My coworkers brought a cake to the office. Sarah organized it. Spent the evening alone by choice — walked around the city until it got dark, ate at a noodle bar, felt completely content. Good year to be alive.` },
  { date: '2015-09-12', color: '#2980b9', mood: 4, content: `Autumn. The city changes when the heat breaks — people come outside more, the light goes golden, the farmers' market comes back. I've settled into a rhythm here. Morning coffee at the cart on the corner, lunch at my desk, evening runs. It's a small life but it's mine.` },
  { date: '2015-11-20', color: '#1abc9c', mood: 3, content: `Thanksgiving alone for the first time. Couldn't afford the flight home. Sarah invited me to her family's but I wanted to try it — to see what it felt like to make a holiday my own. Cooked for four hours for an audience of one. Watched old movies. Weirdly peaceful.` },

  // ══════════════════════════════════════════════════════
  // 2016 — Settling in, first real relationships
  // ══════════════════════════════════════════════════════

  { date: '2016-01-09', color: '#e74c3c', mood: 3, content: `New year. The resolutions feel obligatory but I'm writing them down anyway: save more money, read more fiction, call my sister weekly. The third one is the only one I'll actually keep.` },
  { date: '2016-02-14', color: '#e91e8c', mood: 4, content: `Valentine's dinner with Alex. We've been seeing each other for two months and tonight felt like a real threshold — talking about futures and possibility in a way we haven't before. I walked home instead of taking the subway, needing the cold air to process it. Something is starting.` },
  { date: '2016-03-27', color: '#3498db', mood: 5, content: `Weekend in the mountains with Alex. First trip together and it went better than first trips usually go. We hiked for six hours on Saturday and barely ran out of things to say. At the summit we sat in silence and it wasn't uncomfortable at all. That's how you know.` },
  { date: '2016-05-07', color: '#2ecc71', mood: 4, content: `Got a small raise and a new title — Senior Associate. Sarah and I celebrated with extremely mediocre cocktails at the bar across the street. She told me about her own promotion plans and how patient she's had to be. We've become real friends, the kind where you talk about the actual stuff.` },
  { date: '2016-06-18', color: '#f1c40f', content: `My sister Elena got engaged. I found out over the phone on my lunch break and spent the rest of the afternoon half-working and half-feeling the complicated feeling of someone else's life accelerating. Happy for her. Genuinely. Also aware that I'm not there yet and not sure why.` },
  { date: '2016-07-14', color: '#f39c12', mood: 4, content: `Twenty-eight. Celebrated with Alex and a small group. Alex made a playlist and cooked dinner — tacos with homemade salsa that was absolutely incredible. Elena called from across the country and we talked for an hour. Middle of summer, middle of life. Good place to be.` },
  { date: '2016-09-03', color: '#8e44ad', mood: 3, content: `Alex and I have been having the same argument with different words for three weeks. About where we want to be in two years. About the fact that we want different things and aren't sure how to reconcile them. I don't know if there's a resolution or just an acceptance that we're on different trajectories.` },
  { date: '2016-11-12', color: '#c0392b', mood: 2, content: `Alex and I ended things. Mutual, careful, and still awful. We'd been circling this for months. The relationship was real and good and also fundamentally incompatible in ways neither of us wanted to name. I'm okay. I think I knew it was coming. That doesn't make tonight easier.` },
  { date: '2016-12-23', color: '#27ae60', mood: 3, content: `Home for Christmas. My parents seem smaller somehow — not older exactly, just more settled in their scale. Elena showed me photos of wedding venues on her laptop. I helped her cross four of them off the list. Mom made all my childhood foods. I slept ten hours both nights.` },

  // ══════════════════════════════════════════════════════
  // 2017 — Quieter year, building interiority
  // ══════════════════════════════════════════════════════

  { date: '2017-01-22', color: '#3498db', mood: 3, content: `Post-breakup winter. The apartment feels right-sized for one person in summer and too large in January. I've been cooking elaborate meals for myself — the kind that take two hours — just to fill the evening. Discovered I'm a decent cook when I slow down enough to pay attention.` },
  { date: '2017-02-11', color: '#e67e22', content: `Started going to a weekly trivia night with Sarah and some people from her building. I'm terrible at sports categories and unbeatable at geography. There's something comforting about weekly rituals, small ones, that structure the shapelessness of adult life.` },
  { date: '2017-03-18', color: '#2ecc71', mood: 4, content: `Elena's wedding. I cried twice — once during the vows (expected) and once watching my dad dance badly to a Motown song (unexpected and unexpectedly moving). Flew home just for the weekend. Returned to the city feeling tender and expanded, like something had been gently opened in me.` },
  { date: '2017-05-06', color: '#9b59b6', mood: 4, content: `Bought a proper bookshelf. It sounds trivial but I've been stacking books on the floor for two years, which felt temporary, like I was always about to move. Filling the shelves took a whole evening. My apartment finally looks like a place someone actually lives.` },
  { date: '2017-06-15', color: '#1abc9c', content: `Long weekend road trip by myself. Drove five hours north with a bad playlist and no plan. Stayed at a small inn, walked around a town I'd never heard of, ate breakfast at a diner where everyone seemed to know each other. Total anonymity. Incredibly refreshing.` },
  { date: '2017-07-14', color: '#f39c12', mood: 3, content: `Twenty-nine. The last year of my twenties and I'm surprisingly fine with that. Work is good. Friendships are good. Life is quiet in a way that feels earned rather than settled. Sarah threw a small party. David from work came. Some of her friends I'd never met. Nice evening.` },
  { date: '2017-09-09', color: '#e74c3c', mood: 4, content: `Started a podcast habit. Mostly history and science stuff — three-hour deep dives into medieval agriculture, the formation of mountain ranges, how language changes over centuries. Walking to work listening to someone explain the Roman road system felt genuinely luxurious.` },
  { date: '2017-11-04', color: '#f1c40f', mood: 3, content: `Annual review. Strong rating, some positive language about "leadership potential." I nodded and said the right things. On the walk home I wondered when I stopped feeling the way I felt in year one — hungry, curious, energized. Somewhere between the second and third year, I think. The work became fluent and fluency is not always a friend.` },
  { date: '2017-12-30', color: '#27ae60', mood: 4, content: `End of the year. Home for a week, longer than usual. My parents are planning to retire in a few years. My old bedroom is now my mom's reading room and I slept on the pullout couch, which felt right — this isn't my home anymore in the childhood sense. It's become something else. A place to return to, which is its own kind of gift.` },

  // ══════════════════════════════════════════════════════
  // 2018 — Travel, a new relationship, and its ending
  // ══════════════════════════════════════════════════════

  { date: '2018-01-13', color: '#2980b9', mood: 4, content: `Booked a solo trip to Portugal for March. First time leaving the country in four years. The act of buying the ticket — impulsive, slightly irresponsible — felt like reclaiming something. I don't know what exactly. Maybe the version of me who used to do things on impulse.` },
  { date: '2018-03-09', color: '#f39c12', mood: 5, content: `Lisbon. The tiles, the hills, the light. The particular quality of afternoon sun on old buildings. Ate the most remarkable pastry of my life at a bakery the size of a hallway. Spent the evening watching the sun set over the river with a glass of wine, alone, completely happy. Travel is the fastest way I know to feel like myself.` },
  { date: '2018-03-14', color: '#2ecc71', mood: 5, content: `Still in Portugal. Took a train to a small coastal town and found a beach mostly empty in the off-season. Walked for two hours. The Atlantic is wilder here — colder, more gray-green, less hospitable than the beaches I grew up with. I found myself talking to it. Just standing at the edge and saying things out loud to the water. Something about what I want my life to look like.` },
  { date: '2018-05-03', color: '#9b59b6', mood: 4, content: `Met Jamie at Sarah's housewarming party. We talked for two hours in the kitchen about architecture and cities and whether urban planning can actually change how people live. Later Sarah texted me: "you looked the most awake I've seen you in years." I think she was right.` },
  { date: '2018-06-23', color: '#e91e8c', mood: 5, content: `Jamie and I have been inseparable for six weeks. There's a particular electricity to early time with someone — every conversation feels like discovering a new room. We walked across the whole city on Saturday. Thirteen miles. Neither of us wanted it to end.` },
  { date: '2018-07-14', color: '#f39c12', mood: 5, content: `Thirty. Spent the whole day with Jamie — morning farmers' market, afternoon in the park, evening out with a group that included Sarah and some of Jamie's friends. Everyone got along. Toast at midnight on Sarah's rooftop. I felt genuinely celebrated. Thirty is going to be good.` },
  { date: '2018-09-22', color: '#3498db', mood: 4, content: `Fall. Jamie and I have found a rhythm. Tuesday dinners, weekend mornings, the easy texture of a relationship that's working. I'm aware of being happy in a way I sometimes forget to be — not loudly, but as a low, steady hum underneath everything. I should write this down more.` },
  { date: '2018-11-17', color: '#c0392b', mood: 2, content: `Jamie's job offer. Berlin. A two-year contract designing public spaces for a city renovation project. The exact kind of work Jamie came alive talking about at that first party. How could I ask them not to take it? I couldn't. We talked for four hours and cried and are still in it but I can already feel the shape of what's coming.` },
  { date: '2018-12-28', color: '#8e44ad', mood: 2, content: `Jamie leaves in three weeks. We're spending every available hour together which makes the leaving both easier and harder. We've decided not to try long distance. The decision is right and also devastating. The city will look different when they're gone. I'll look different, maybe.` },

  // ══════════════════════════════════════════════════════
  // 2019 — Recovery, a new apartment, deeper friendship with Sarah
  // ══════════════════════════════════════════════════════

  { date: '2019-01-19', color: '#1abc9c', mood: 2, content: `Jamie is gone three weeks now. The apartment is very quiet. I've been filling it with podcasts and cooking and long walks. Sarah has been checking in daily which I pretend to find excessive but actually need. Loss makes you grateful for the people who stay.` },
  { date: '2019-02-23', color: '#e67e22', mood: 3, content: `Finally signed up for a language class. Spanish, Tuesday nights, community center around the corner. My pronunciation is appalling. The instructor, who is very patient, said "you have enthusiasm, which counts for something." I'll take it.` },
  { date: '2019-04-06', color: '#2ecc71', mood: 4, content: `Spring arrived properly this week. Open windows, the smell of rain, tulips in the little garden outside the coffee shop. I realized I'd been holding my breath all winter and just now exhaled. Grief has a season, apparently, and spring is when it starts to lift.` },
  { date: '2019-05-18', color: '#3498db', mood: 4, content: `Found a new apartment — bigger, better light, closer to Sarah. Moving is a ritual I've come to love: the forced curation of your own life, deciding what comes with you and what gets left behind. Threw out three boxes of things I'd been carrying for no reason. Felt lighter immediately.` },
  { date: '2019-06-29', color: '#9b59b6', content: `New apartment, one month in. The light in the mornings is different from anywhere I've lived — it comes in at an angle that makes everything golden for about forty minutes. I've been waking up early just to sit in it. Drinking coffee slowly. Watching the dust motes. This is the best version of my apartment life.` },
  { date: '2019-07-14', color: '#f39c12', mood: 4, content: `Thirty-one. Quieter birthday than last year — dinner with Sarah, a long walk afterward. We talked about what the next decade is supposed to look like. "Supposed to" is a weird phrase — according to whom? I want to stop organizing my life around what it's supposed to be and just build what I actually want. I'm not sure yet what that is.` },
  { date: '2019-09-07', color: '#f1c40f', mood: 5, content: `Weekend trip to Elena's. The baby — my first nephew, Thomas — is four months old. I held him for an hour and he fell asleep on my chest and I understood, very clearly, why people do this. Not that I know what I want for myself. But I understood it for them.` },
  { date: '2019-10-26', color: '#e74c3c', mood: 3, content: `Work thing: I passed over a project I actually wanted. Gave it to someone else because they needed the visibility more than I did. Generous or self-defeating? Genuinely unsure. David said it was "mature." I nodded and went back to my desk and felt neither mature nor immature. Just tired.` },
  { date: '2019-12-07', color: '#27ae60', mood: 4, content: `Trivia night win. First time our team has actually won. The prize was a bar tab we used to order four extremely elaborate cocktails and toast to obscure historical facts. Sarah did the acceptance speech. She should run for office.` },
  { date: '2019-12-31', color: '#2980b9', mood: 3, content: `Last night of the decade. Sarah's apartment, twelve of us, someone's playlist, midnight countdown with cheap champagne. The 2010s were the decade I became an adult — badly, then slowly, then suddenly. I have no idea what shape the 2020s will take. I'm trying to be okay with that.` },

  // ══════════════════════════════════════════════════════
  // 2020 — Pandemic
  // ══════════════════════════════════════════════════════

  { date: '2020-01-25', color: '#3498db', mood: 4, content: `Winter but the apartment is warm. I've been rearranging the furniture again — third time this year. The act of changing a room is the fastest way I know to get a new perspective on everything else in it. Put the armchair by the south window and the whole living room opened up.` },
  { date: '2020-02-15', color: '#2ecc71', mood: 4, content: `Valentines Day weekend with Sarah — our annual friend dinner tradition. We went to a new French place and ordered too much and talked for four hours. She's doing well at work, navigating office politics with that effortless grace she has. I told her I feel stuck. She said everyone does, they just don't say it.` },
  { date: '2020-03-14', color: '#c0392b', mood: 2, content: `Everything has changed. The office closed this week. "Work from home until further notice." The news is filling with numbers and projections and language none of us know how to process. I walked to the corner store for groceries and the block was nearly empty at noon on a Saturday. The city doesn't feel like the city.` },
  { date: '2020-03-28', color: '#e74c3c', mood: 2, content: `Week three of lockdown. I've been working from the kitchen table since the desk doesn't have enough natural light. Video calls all day. The apartment which I used to love for its solitude now feels very small. Sarah and I text constantly. My sister Elena sends pictures of Thomas and the baby (Mira, now four months) which helps.` },
  { date: '2020-04-18', color: '#f1c40f', mood: 3, content: `Started baking bread. Everyone is baking bread. But the ritual of it — measuring, kneading, waiting, the smell — is genuinely useful right now. The bread gives the day a shape. By 8am I've done something real. Everything else can be whatever it is.` },
  { date: '2020-05-10', color: '#9b59b6', mood: 3, content: `Video calls with my parents every Sunday now. My dad doesn't quite know how to look at the camera. My mom talks to me like I'm in the room, which makes it easier. They seem okay — garden projects, reading, the rhythms of retirement-adjacent life. I worry about them in a new way.` },
  { date: '2020-06-21', color: '#e67e22', content: `Summer and we can go outside but cautiously, distanced, masked. Sarah and I have been doing socially distanced walks — we established a circuit through the park that takes exactly an hour. Three days a week, same route, endless conversations. It's become the best part of my week.` },
  { date: '2020-07-14', color: '#f39c12', mood: 3, content: `Thirty-two. Birthday over video call. Sarah organized a Zoom with about fifteen people which was sweet and also surreal — a grid of faces on a laptop screen, everyone slightly delayed. Elena held up Thomas and Mira for the camera. My mom cried. I didn't, but it was close. This is the strangest year.` },
  { date: '2020-09-05', color: '#1abc9c', mood: 3, content: `Months of this now. I've reached a kind of equilibrium — not happiness exactly but adaptation. The apartment has been reorganized, optimized, lived in fully. I know every shadow, every sound the pipes make, the exact angle of the afternoon light in September. I know this place the way you come to know yourself when there's nowhere else to be.` },
  { date: '2020-11-05', color: '#2980b9', mood: 3, content: `Election week. Waiting, watching, the specific exhaustion of collective anxiety. Called my parents both days. Called Sarah both evenings. Made elaborate dinners because cooking is the only thing I could control. The bread is getting very good.` },
  { date: '2020-12-19', color: '#27ae60', mood: 4, content: `Vaccine news. Something in the air shifted — not immediately, but like a pressure change before weather. My sister sent a voice memo of Thomas saying "I want to see you" and I had to put my phone down for a minute. Nine months of this. A little while longer and then things will change again.` },

  // ══════════════════════════════════════════════════════
  // 2021 — Reopening, visits, energy returning
  // ══════════════════════════════════════════════════════

  { date: '2021-02-06', color: '#3498db', mood: 3, content: `Vaccinated. The shot itself was unremarkable — a small jab, fifteen minutes in a plastic chair, a band-aid. The walk home was extraordinary. Something had been lifted. I walked the long way and cried a little bit at nothing in particular. Collective grief does strange things to you.` },
  { date: '2021-03-27', color: '#2ecc71', mood: 4, content: `First indoor meal with Sarah, just the two of us, at a restaurant for the first time in a year. The noise of other tables, a menu, a candle, a waiter. We ordered wine and sat there and just looked at each other. "Normal," she said, "I forgot what this felt like." Me too.` },
  { date: '2021-05-15', color: '#f1c40f', mood: 5, content: `First visit to Elena's since before everything. Saw Thomas and Mira in person for the first time in over a year. Thomas is four now — he ran to me at the door. I picked him up and he said "you're really here" with total sincerity and I cried on his little shoulder and he patted my back. Best moment of the year. Maybe several years.` },
  { date: '2021-06-12', color: '#e91e8c', mood: 4, content: `The city came back. All at once and then slowly, then all at once again. Restaurants, bars, music from windows. The farmers' market returned. My corner coffee cart opened with a new barista who doesn't remember my order yet but will. Ordinary life reassembling itself. I'd forgotten how much I loved it.` },
  { date: '2021-07-14', color: '#f39c12', mood: 4, content: `Thirty-three. Real birthday again — actual people, actual room, actual noise. Sarah threw a party at her place. Music, too much food, people I hadn't seen for a year who all looked slightly different in ways I couldn't name. We stayed until 2am. I stood in the kitchen at midnight thinking: this is what I missed most. The specific warmth of a crowd of people you love.` },
  { date: '2021-08-28', color: '#9b59b6', content: `Finally took a week off. Drove up the coast — no plan beyond a rough route and a list of diners. Swam every day. Read three novels. Didn't think about work once, which I consider a significant achievement. The year of recovery is ending. I feel like I've been returned to myself, somewhat restored.` },
  { date: '2021-10-09', color: '#e67e22', mood: 3, content: `Work has changed in ways I can't quite articulate. The rhythm of remote work became its own thing and now we're hybrid and neither mode feels entirely right. I miss the serendipity of the office — the hallway conversation, the lunch-break discovery. But I also miss the silence of 9am at my kitchen table. I can't have both.` },
  { date: '2021-12-26', color: '#1abc9c', mood: 4, content: `Christmas at Elena's. Thomas made me a drawing of the two of us ("you and me at the beach," he said, though we've never been to the beach together — he is painting the future, which I find charming). Mira learned to say my name this year and kept saying it at dinner. Loud, repeated, proud. The best sound.` },

  // ══════════════════════════════════════════════════════
  // 2022 — Meets Marcus, career plateau, art interest stirs
  // ══════════════════════════════════════════════════════

  { date: '2022-01-08', color: '#3498db', mood: 3, content: `A new year that looks a lot like the last one. Back in the office two days a week. The commute feels like a different language I used to speak fluently and now have to consciously translate. Sarah and I eat lunch together on Tuesdays. A small anchor.` },
  { date: '2022-02-19', color: '#e67e22', mood: 4, content: `Museum afternoon. Sarah dragged me to an exhibition of postwar ceramics and I expected to be mildly bored. Instead I stood in front of one piece for fifteen minutes — a tall vase with a pale green glaze that looked like water caught in glass. Something about the form and the material together. I bought the catalog.` },
  { date: '2022-04-16', color: '#2ecc71', mood: 4, content: `Spring hike with a new group Sarah found. I almost didn't go. Awkward for the first hour — small talk on a trail is its own skill — and then I met Marcus. We ended up at the back of the pack talking about cities and design and why some public spaces work and others feel like parking lots in disguise. Six miles went by like nothing.` },
  { date: '2022-05-07', color: '#9b59b6', mood: 4, content: `Second hike with the group. Marcus brought a thermos of coffee and we shared it at the summit. He's a project manager at an engineering firm but talks about urban space the way you talk about something you love. He said he's been thinking about going back to school. I told him he should. I meant it.` },
  { date: '2022-06-18', color: '#f1c40f', mood: 5, content: `Group hike to the fire tower. Eight miles, 1,500 feet of elevation, completely worth it. Stood at the top and you could see three states. Marcus pointed out how the roads below followed the old trails which followed the water which followed the land. The logic of place. I've been thinking about it since.` },
  { date: '2022-07-14', color: '#f39c12', mood: 4, content: `Thirty-four. Sarah, Marcus, and I went to that Thai place that became "our place" sometime this year without anyone deciding. Marcus gave me a book about Japanese craft traditions. Sarah gave me a very beautiful ceramic bowl from a local maker. Two friends who know me well. Lucky.` },
  { date: '2022-09-03', color: '#e74c3c', mood: 2, content: `Promotion decision came back. Negative. They promoted someone two years younger with less experience and I spent a week being quietly furious before arriving at the less satisfying but more honest feeling: I hadn't really tried for it. I'd shown up. I'd done good work. But I hadn't wanted it enough to reach for it. That's on me, I think.` },
  { date: '2022-10-22', color: '#8e44ad', mood: 3, content: `Autumn leaves are at peak. Biked through the park on Saturday and the trees were outrageous — oranges and reds I can't quite believe are real. I stopped to look. Just stood there next to my bike for ten minutes looking at the trees. A woman walking by caught my eye and said "I know, right?" That's the whole conversation. That's enough.` },
  { date: '2022-11-26', color: '#27ae60', mood: 4, content: `Thanksgiving at Elena's this year. Thomas (five now, very confident) organized the seating chart. I was placed between Mira and the dog, which tells you everything you need to know about my family's opinion of me. The food was incredible. My brother-in-law made a pie from scratch. Everyone ate too much and no one left until late.` },
  { date: '2022-12-17', color: '#1abc9c', mood: 3, content: `Year-end retrospective, as I do every December. What did I build this year? Marcus and Sarah — that's the real answer. Two people I didn't know eighteen months ago who have become architecture. Everything else is occupancy. I'm grateful for the people. Uncertain about everything else.` },

  // ══════════════════════════════════════════════════════
  // 2023 — The plateau becomes visible
  // ══════════════════════════════════════════════════════

  { date: '2023-01-21', color: '#3498db', mood: 3, content: `January doldrums. The city is gray and cold and everyone's resolution energy has evaporated. I signed up for a ceramics museum tour thing — not a class, just a guided walk through their permanent collection. A small step toward something I can't name yet.` },
  { date: '2023-02-11', color: '#2ecc71', mood: 4, content: `Ceramics tour. The guide talked about the Korean tradition of celadon glazes — the sea-green color, the secret of the ash glaze, the way each piece held the temperature of its firing like a record. I was the only person in the group who asked questions. I bought three books from the gift shop.` },
  { date: '2023-03-25', color: '#9b59b6', content: `Elena called. She's pregnant again — third kid. She sounds happy and tired. I asked if it was planned and she laughed and said "you ask that every time." Fair. I'm going to be an uncle again, which I'm excellent at. The low-stakes affection of unclehood suits me.` },
  { date: '2023-04-08', color: '#f1c40f', mood: 3, content: `Staff reorganization at work. New team structure, new manager — Julia, who is sharper and more demanding than David. I'm supposed to find this motivating. Some days I do. Most days the work feels like a language I'm fluent in but have stopped wanting to read. Competence is a comfortable trap.` },
  { date: '2023-05-20', color: '#e67e22', mood: 4, content: `Weekend with Marcus and Sarah — rented a cabin an hour from the city. Hiked Saturday, lazy Sunday morning, long dinner with bad wine and excellent conversation. Marcus is deep in his grad school research; Sarah is managing twice as many people as last year. I'm the same as I was last May. I'm not sure how I feel about that.` },
  { date: '2023-06-10', color: '#1abc9c', mood: 4, content: `Early June. Biking to work again. The city in summer bike-time is a completely different city from the bus — smaller, more human-scaled, more mine. I've been taking slightly different routes just to see new blocks. The city has more corners than you think.` },
  { date: '2023-07-14', color: '#f39c12', mood: 3, content: `Thirty-five. Half of seventy. The birthday where people start saying you're in your "mid-thirties" which somehow sounds different from "early thirties" even though the math says it shouldn't. Had dinner with Sarah and Marcus. Sarah said "you seem more restless than last year." She's right. I am. I can't quite see what I'm restless toward yet.` },
  { date: '2023-08-19', color: '#c0392b', mood: 2, content: `A colleague I mentored got promoted into a senior role that I didn't apply for because I knew I'd get it and I didn't want it, which should feel okay but just feels like evidence of something wrong. I've been doing good work in a direction I don't particularly want to go. That's a slow kind of loss.` },
  { date: '2023-09-30', color: '#2980b9', mood: 3, content: `Fall again. I notice the seasons more than I used to — the quality of light shifts, the air changes weight. I've been drawing again: just the view from my window, just shapes. The roofline across the street, the water tower, the slant of afternoon light. My hands remember school, when I used to draw seriously.` },
  { date: '2023-11-11', color: '#8e44ad', mood: 3, content: `Marcus gave his notice at work. He's applying for grad school in the spring. Urban planning, three schools, his portfolio is extraordinary. I looked at it over dinner and felt something I couldn't quite name — a kind of recognition. "You built all this?" I asked. He nodded. "While doing a job I only halfway care about," he said.` },
  { date: '2023-12-28', color: '#27ae60', mood: 3, content: `The year ends quietly. Home for five days — parents, Elena, the kids. Thomas is six and draws constantly; he made me a portrait that was more accurate than he could possibly know. Mira is three and calls everyone "my guy." The baby (Leo, two months) mostly sleeps and eats. I helped Elena wash dishes after Christmas dinner and we talked the way we can — honest, no performance. She asked what I want. I said I was still finding out. She nodded like she believed me. I'm working on believing myself.` },

  // ══════════════════════════════════════════════════════
  // 2024 — The year before the turn
  // ══════════════════════════════════════════════════════

  { date: '2024-01-06', color: '#3498db', mood: 3, content: `New year. Ten years since I graduated. I look at photos from then and can't quite place myself in them — the face is mine but the context is someone else's world. I wonder if the person I was at twenty-three would recognize this life as something they'd have chosen. Probably not. But I think they'd understand it eventually.` },
  { date: '2024-02-03', color: '#e67e22', mood: 4, content: `Went to a ceramics fair at the arts center — sixty makers, tables covered with bowls and mugs and sculptures. Spent two hours just walking and looking. Bought a small vase from a young maker who explained every glaze decision with the precision of a scientist and the vocabulary of a painter. I kept thinking: what would it be like to talk about your work that way?` },
  { date: '2024-03-09', color: '#2ecc71', mood: 4, content: `Marcus got into two schools. Both good programs. He's going to accept the one in the city, which means he's staying — different life, same geography. Sarah took us both out to celebrate and we sat in a booth for three hours toasting his future and something about the joy of watching someone become more themselves.` },
  { date: '2024-04-27', color: '#9b59b6', mood: 3, content: `Spring but it doesn't feel like spring yet on the inside. Had a frank conversation with Julia about my trajectory. She's supportive but honest: if I want to advance, I need to own something bigger. I nodded. The honest answer was: I don't know if advancing in this direction is what I want. I couldn't say that. But she could probably tell.` },
  { date: '2024-05-18', color: '#1abc9c', mood: 4, content: `Weekend with Elena's family — took Thomas to the science museum just us two. He held my hand in the dark planetarium and when the stars came out he whispered "are we inside space now?" I said yes. He thought about that for a long time and then nodded like he'd decided to accept it. Six years old and already at peace with wonder.` },
  { date: '2024-06-08', color: '#f39c12', content: `Midsummer. Long evenings. I've been sitting on the fire escape after dinner watching the neighborhood wind down. Something about evening light on brick, the sounds of the block — kids, music, a dog somewhere. Ordinary life that I know I'll miss someday and am not fully appreciating now, which is the human condition and very annoying.` },
  { date: '2024-07-14', color: '#f39c12', mood: 3, content: `Thirty-six. Sarah asked if I had what I wanted at thirty-six. I said I wasn't sure I'd identified what I wanted at thirty-six. She said "that's your answer then." She didn't mean it as a criticism and I didn't take it that way. It's just the truth. A useful truth to have clearly named.` },
  { date: '2024-08-17', color: '#c0392b', mood: 2, content: `Two weeks of work travel — three cities, four clients, six flights. The accumulation of identical hotel rooms and identical airport terminals and slightly different conference tables starts to blur into one composite nowhere. On the last flight home I sat in the window seat and stared at clouds for three hours and felt absolutely nothing. That felt significant.` },
  { date: '2024-09-21', color: '#8e44ad', mood: 3, content: `Saw a ceramics demo at the arts center — a visiting artist throwing on the wheel, narrating the process. The clay centered under her hands with this quiet efficiency. She said "the clay doesn't forgive inattention but it always tells you where you've lost it." I've been thinking about that for days. What would it be like to work in a medium that gives you that immediate feedback?` },
  { date: '2024-10-19', color: '#f1c40f', mood: 4, content: `Autumn hike — the whole group, plus Marcus's school friends now too. A good day: perfect temperature, brilliant colors, everyone in high spirits. I led the back section with a grad student named Jordan who does her dissertation on accessible public space. We talked for four miles. I drove home feeling expanded.` },
  { date: '2024-11-23', color: '#27ae60', mood: 4, content: `Thanksgiving at my place for the first time — small group, my cooking. Sarah brought wine, her girlfriend brought a pie, Marcus brought his enormous laugh. We ate at my small table with an extra chair wedged in. Chaotic and warm and exactly what I didn't know I needed. Grateful for this city that I chose and that has slowly chosen me back.` },
  { date: '2024-12-14', color: '#2980b9', mood: 3, content: `Year-end quiet. Sitting with what I know: I'm good at my job and increasingly uninterested in it. I love my life — my people, my apartment, my city — and am aware something is missing from the middle of it. A project. A practice. Something I'm building not because someone is paying me to but because I can't not. I don't know what that is yet. But I think I'm close to finding it.` },

  // ══════════════════════════════════════════════════════
  // 2025 — Pottery begins; the turn
  // ══════════════════════════════════════════════════════

  { date: '2025-01-03', color: '#3498db', mood: 4, content: `New year, same apartment. I rearranged my desk so it faces the window now. Small thing but it changed how the whole room feels. Spent most of the day just sitting here watching snow fall and thinking about what I actually want this year to look like.` },
  { date: '2025-01-08', color: '#9b59b6', mood: 2, content: `Bad day at work. The project I spent three weeks on got shelved because leadership changed priorities again. I know it's normal but it's hard not to take it personally. Called Sarah after — she reminded me that I felt the same way last spring and it passed. She's right but still.` },
  { date: '2025-01-14', color: '#2ecc71', mood: 4, content: `Marcus and I went for a long walk along the river even though it was freezing. We talked about whether we're actually doing what we want to be doing or just following momentum. He's thinking about going back to school. I didn't say much but I've been turning the same question over in my head all week.` },
  { date: '2025-01-19', color: '#1abc9c', mood: 3, content: `Found my old sketchbooks from college while clearing out the closet. I used to draw every day — I'd forgotten that. Charcoal studies, quick gesture sketches, elaborate maps of imaginary cities. The hands in the drawings looked confident. I held the books for a long time.` },
  { date: '2025-01-22', color: '#e67e22', content: `Started reading a book on ceramics my sister gave me for Christmas. I don't know anything about pottery but something about the way the author describes working with clay — how you have to respond to the material instead of forcing it — resonated with me. Maybe I should try making something with my hands.` },
  { date: '2025-01-29', color: '#1abc9c', content: `Quiet week. Cooked a lot. Made that lentil soup recipe three times trying to get it right. I think the trick is more cumin than you'd expect. Felt good to focus on something simple and immediate.` },

  { date: '2025-02-02', color: '#2980b9', content: `Lazy Sunday. Reorganized my bookshelf by color instead of author, which is impractical but looks incredible. Sometimes aesthetics matter more than function. Made coffee twice because the first cup got cold while I was arranging.` },
  { date: '2025-02-04', color: '#e74c3c', mood: 2, content: `Performance review was fine — "meets expectations" across the board. Which should feel okay but honestly it just made me wonder if I want to keep meeting these particular expectations. There's nothing wrong with my job but there's nothing pulling me forward either.` },
  { date: '2025-02-11', color: '#3498db', mood: 4, content: `Valentine's week. Not in a romantic way — Sarah organized a dinner for a bunch of us who are single or just wanted low-key company. We made pasta from scratch and it was genuinely one of the best nights I've had in months. Sometimes friendship is the whole point.` },
  { date: '2025-02-19', color: '#f1c40f', content: `Snow day. Worked from home and spent lunch staring out the window again. I keep coming back to this idea of making something — a project outside of work. Nothing specific yet. Just the pull toward creating rather than maintaining.` },
  { date: '2025-02-25', color: '#27ae60', mood: 4, content: `My sister visited for the weekend. We went to that ceramics studio downtown and I actually threw my first pot. It was terrible — lopsided and too thick — but the feeling of wet clay spinning under my hands was incredible. I think I'm going to sign up for the beginner class.` },

  { date: '2025-03-02', color: '#f39c12', mood: 5, content: `Signed up for the pottery class. Six weeks, Tuesday evenings. First session was mostly wedging clay and learning about the wheel. The instructor said something that stuck with me: "The pot already exists in the clay. Your job is to find it." I know it's a little cheesy but I keep thinking about it.` },
  { date: '2025-03-09', color: '#e91e8c', mood: 4, content: `Second pottery class. Made a small bowl that actually looks like a bowl. The glazing options are overwhelming — so many colors. I chose a deep blue-green that reminded me of the ocean. Won't see the finished piece for two weeks though. The waiting is part of it.` },
  { date: '2025-03-16', color: '#8e44ad', content: `Work is fine. That word again — fine. Had a meeting about next quarter's goals and I couldn't bring myself to care about any of them. I know I should be more engaged but Tuesday evenings at the studio are the only hours that feel like mine lately.` },
  { date: '2025-03-22', color: '#2ecc71', mood: 4, content: `Got my first glazed bowl back. The blue-green came out darker than I expected but it's beautiful in its own way. I eat cereal out of it now. There's something deeply satisfying about using something you made with your own hands. Marcus said it looks like a dog bowl. He's not wrong.` },
  { date: '2025-03-30', color: '#3498db', mood: 3, content: `End of the month. Been thinking a lot about direction. Where am I headed? Not in a crisis way, more like standing at a crossroads and all the signs are blank. The pottery helps — it's something concrete (well, ceramic) in a life that feels abstract. Sarah says I'm overthinking it. Probably.` },

  { date: '2025-04-02', color: '#ff6b35', mood: 3, content: `Woke up at 4am with this knot of anxiety about nothing specific. Lay there cataloguing everything in my life — job, apartment, relationships, hobbies — and none of it felt wrong exactly. It's more like I'm wearing someone else's well-fitting clothes. Everything fits but nothing is mine.` },
  { date: '2025-04-05', color: '#2ecc71', mood: 4, content: `Spring finally. The trees outside my window are starting to bud. Went for a run for the first time since November and it was brutal but the air smelled like wet earth and possibility. Dramatic? Sure. But that's how it felt.` },
  { date: '2025-04-12', color: '#f1c40f', mood: 5, content: `Pottery class finale. I made a set of four mugs that I'm genuinely proud of. They're not perfect — slightly different sizes, one handle is a little crooked — but they're mine. Gave one to Sarah, one to Marcus. Keeping two. The instructor said I have a good instinct for form. That might be the nicest thing anyone's said to me in a while.` },
  { date: '2025-04-18', color: '#e67e22', content: `The class ended and now Tuesday evenings are empty again. Looked into intermediate classes but they don't start until fall. I could practice at the open studio hours but it's not the same without the structure. Feeling that familiar drift.` },
  { date: '2025-04-25', color: '#9b59b6', mood: 4, content: `Dinner at my sister's place. Her kids are getting so big. My nephew asked me what I do for work and I realized I couldn't explain it in a way that makes sense to a seven-year-old. "I help companies organize their information" got a blank stare. Fair enough, kid.` },

  { date: '2025-05-02', color: '#1abc9c', mood: 4, content: `Beautiful weekend. Sat in the park with a book and didn't look at my phone for three hours. Read almost the whole thing — a novel about a lighthouse keeper. Something about solitude as a choice rather than a circumstance. Felt very relevant.` },
  { date: '2025-05-10', color: '#e74c3c', mood: 2, content: `Career anxiety is back. A colleague my age just got promoted to a role I didn't even know existed. I'm not jealous exactly — I don't want their job — but it highlighted how long I've been standing still. What am I building toward? I genuinely don't know.` },
  { date: '2025-05-17', color: '#3498db', content: `Sarah's birthday party. She turned 35 and seemed genuinely happy about it. "I finally feel like I know who I am," she said. I smiled and meant it for her but inside I thought: I'm 36 and I'm still figuring that out. Different timelines I guess.` },
  { date: '2025-05-24', color: '#27ae60', mood: 4, content: `Started biking to work now that the weather's nice. Twenty minutes each way and it completely changes my mood. Arrived at my desk this morning actually looking forward to the day. Fresh air is underrated as a productivity tool.` },
  { date: '2025-05-31', color: '#f39c12', content: `End of May. Marcus invited me to join a weekend hiking group he found. I said yes before I could talk myself out of it. First hike is next Saturday. I need to buy actual hiking boots apparently.` },

  { date: '2025-06-03', color: '#2980b9', mood: 4, content: `Sarah and I tried that new ramen place downtown. Way too much food but worth it. She's been promoted at her firm and she's handling it with that effortless confidence she has. Walking home after, the city felt alive — music from open windows, people on stoops. Summer in the city is something else.` },
  { date: '2025-06-07', color: '#2ecc71', mood: 5, content: `First hike with Marcus's group. Eight miles through the state park. My feet are destroyed but the view from the ridge was worth every blister. Met some interesting people — a teacher, a nurse, a guy who builds furniture. Nobody talked about corporate strategy once. It was wonderful.` },
  { date: '2025-06-14', color: '#e67e22', content: `Long days now. Light until almost 9pm. I've been sitting on my fire escape after dinner just watching the neighborhood. Kids playing, people walking dogs, the ice cream truck making its rounds. Ordinary life. I forget sometimes that ordinary can be enough.` },
  { date: '2025-06-21', color: '#f1c40f', mood: 4, content: `Summer solstice. Longest day of the year and I spent it well — morning run, good work session, evening bike ride along the canal. Felt fully in my body for the first time in a while. My sister called to tell me she's pregnant again. Third kid. She sounds happy and exhausted, which seems about right.` },
  { date: '2025-06-28', color: '#1abc9c', content: `Quarterly planning at work. They want me to lead a new initiative around data migration. It's more responsibility and I should be excited but mostly I feel tired. Said yes anyway. What else was I going to say?` },

  { date: '2025-07-01', color: '#f1c40f', mood: 3, content: `First of July. Summer is wide open and I don't have plans, which is either freedom or emptiness depending on the hour. Cleaned the whole apartment and rearranged the living room. The pottery bowl lives on the kitchen windowsill now where the morning light hits it. Small comforts.` },
  { date: '2025-07-04', color: '#e74c3c', mood: 4, content: `Fourth of July at Marcus's rooftop. Fireworks over the river. Sarah brought her new girlfriend and they seem really good together. Ate too many hot dogs. Felt patriotic in the way where you love the people around you more than any abstract idea.` },
  { date: '2025-07-12', color: '#ff6b35', content: `Work has been consuming. The data migration project is bigger than anyone estimated and I'm the one holding the timeline together. Late nights, weekend emails. I haven't biked to work in two weeks. Haven't done much of anything except work and sleep.` },
  { date: '2025-07-14', color: '#f39c12', mood: 3, content: `My birthday. 37. My sister sent a cake. Marcus and Sarah took me to that Thai place we like. Blew out a candle on a slice of mango sticky rice. Made a wish I'm not going to write down. Good day overall but birthdays always make me take stock, and the inventory is complicated.` },
  { date: '2025-07-20', color: '#9b59b6', mood: 3, content: `Went to the open studio for the first time since the class ended. Just practiced centering for two hours. No finished pieces. The instructor from the beginner class was there and nodded at me when I came in. Small belonging.` },
  { date: '2025-07-23', color: '#9b59b6', mood: 2, content: `Can't sleep. Lying here at 2am thinking about five years from now. Will I still be doing this? "This" meaning my job, this city, this life. I don't hate any of it but I don't feel pulled toward it either. I keep waiting for clarity that doesn't come. Maybe clarity isn't something that arrives. Maybe you have to build it.` },
  { date: '2025-07-30', color: '#3498db', content: `Took a day off and went to the lake by myself. Floated on my back and stared at the sky for an hour. Didn't think about work. Didn't think about direction or purpose or what I'm doing with my life. Just floated. It was perfect.` },

  { date: '2025-08-02', color: '#f39c12', content: `Hot weekend. Stayed inside with the blinds drawn and rewatched a documentary about Japanese woodworkers. The patience they have — spending decades perfecting one type of joint. I don't have that patience but I admire it. Maybe admiring it is the first step toward having it.` },
  { date: '2025-08-06', color: '#2ecc71', mood: 4, content: `The data migration shipped. Not perfectly — there's a cleanup phase coming — but the hard part is done. My manager said "great job" in the team meeting and I felt absolutely nothing. That should probably concern me more than it does.` },
  { date: '2025-08-13', color: '#e67e22', mood: 3, content: `Hiking again after a month off. Different trail this time — more elevation, fewer people. Marcus and I got ahead of the group and had one of those rare honest conversations. He's decided to apply for grad school. Urban planning. When he talked about it his face lit up in a way I recognized from when I talk about pottery. I miss that feeling.` },
  { date: '2025-08-20', color: '#c0392b', mood: 2, content: `Bad week. Everything feels slightly off — like wearing shoes on the wrong feet. Work is fine. Apartment is fine. I'm fine. But "fine" is starting to feel like a trap. My sister keeps asking if I'm okay and I keep saying yes and we both know it's not the whole truth.` },
  { date: '2025-08-28', color: '#1abc9c', content: `Late August. The light is already changing — golden hour comes earlier, shadows are longer. I love this time of year even though it makes me melancholy. Ordered some art supplies on impulse. Charcoal pencils and a sketchpad. Who knows.` },

  { date: '2025-09-01', color: '#e67e22', content: `Labor Day. Grilled at my sister's place. The kids ran through sprinklers while the adults talked about nothing important. My brother-in-law asked about work and I gave my standard non-answer. My sister caught my eye across the yard. She knows.` },
  { date: '2025-09-03', color: '#8e44ad', mood: 3, content: `First day of September and it already feels like fall. Cool mornings, warm afternoons. I drew for the first time in years — nothing ambitious, just the view from my window. The trees, the rooftops, the water tower. It was bad but it was something. My hands remembered more than I expected.` },
  { date: '2025-09-10', color: '#3498db', mood: 2, content: `Annual review cycle is starting and I have to write my self-assessment. Trying to articulate my "career aspirations" for the fifth year in a row. Each year the answer gets vaguer. I used to want to be a director. Now I just want to want something clearly.` },
  { date: '2025-09-18', color: '#f1c40f', mood: 4, content: `Sarah and I went apple picking upstate. Came home with way too many apples and spent the evening making pie. Hers was beautiful. Mine looked like a geological event. Tasted good though. We talked about her relationship and she's really happy. It's nice to watch someone you love be happy.` },
  { date: '2025-09-25', color: '#e74c3c', mood: 3, content: `Fall is here. I can feel it in my bones — that shift toward introspection. Pulled out my pottery bowl this morning and just held it. Thought about how I felt making it. That focus, that presence. I want more of that in my life. The intermediate pottery class starts in two weeks. I already signed up.` },

  { date: '2025-10-02', color: '#f39c12', mood: 4, content: `First intermediate pottery class. Harder than I remembered — we're doing lidded vessels now, which require precision I haven't developed yet. My lid didn't fit my pot even slightly. But being back at the wheel felt like coming home. The clay doesn't care about your career aspirations. It just wants you to pay attention.` },
  { date: '2025-10-09', color: '#27ae60', mood: 5, content: `Made a lidded jar that actually closes. The instructor said my centering has improved. Such a simple compliment but I carried it around all day like a gift. After class I sat in the parking lot for ten minutes just feeling good. When was the last time work made me feel that way? I can't remember.` },
  { date: '2025-10-16', color: '#9b59b6', content: `Marcus got into grad school. He starts in January. I'm thrilled for him and also aware of this quiet jealousy — not of the school itself but of the certainty. He found his thing. He made a decision and went after it. I'm still circling.` },
  { date: '2025-10-22', color: '#2ecc71', mood: 4, content: `Autumn colors are peaking. Biked through the park on my way home and the trees were on fire — reds, oranges, yellows. Stopped to take a photo and then put my phone away and just looked. Some things are better as memories than images.` },
  { date: '2025-10-30', color: '#e67e22', mood: 4, content: `Halloween prep at my sister's house. Helped the kids carve pumpkins. My nephew wanted a "scary dinosaur" which is challenging on a round surface but we made it work. My sister pulled me aside after and said she's worried about me. I told her I'm figuring things out. She said "you've been figuring things out for two years." Ouch. But fair.` },

  { date: '2025-11-02', color: '#e67e22', mood: 3, content: `Daylight savings ended. Lost an hour of evening light and gained an hour of morning I'll never use. Made soup and bread from scratch — the apartment smelled incredible all afternoon. Texted Sarah a photo and she showed up twenty minutes later with wine. That's friendship.` },
  { date: '2025-11-05', color: '#c0392b', mood: 2, content: `Dark at 5pm now. The seasonal shift always hits me harder than I expect. Pottery is the bright spot — I'm working on a series of small cups. Each one slightly different. The repetition is meditative. Make a cup, make another cup. Each one teaches you something the last one didn't.` },
  { date: '2025-11-12', color: '#3498db', content: `Had coffee with an old college friend who left tech to become a therapist. She said something that stuck: "You don't have to know what you want. You just have to notice what you keep coming back to." I keep coming back to making things. That probably means something.` },
  { date: '2025-11-16', color: '#8e44ad', mood: 3, content: `Open studio Saturday. Made three bowls, threw two away. The one I kept has a slight warp in the rim that the instructor said looked intentional. It wasn't. But I'm keeping it anyway. The accidental things are sometimes the best things.` },
  { date: '2025-11-19', color: '#e74c3c', mood: 2, content: `Work drama. Restructuring rumors. Nobody knows what's happening but everyone's anxious. I realized I'm less worried about losing my job than I am about keeping it. What does that tell you? Had a long phone call with my sister about it. She said maybe the universe is trying to tell me something. I don't believe in that kind of thing but the timing is suspicious.` },
  { date: '2025-11-27', color: '#f1c40f', mood: 4, content: `Thanksgiving at my sister's. The kids made place cards with crayon drawings of each person. Mine had a giant head and tiny arms. Accurate. The food was good, the company was better. Marcus came too — his family is all in Portland. Sarah FaceTimed from her girlfriend's parents' place. Grateful for these people. That's not nothing.` },

  { date: '2025-12-03', color: '#9b59b6', mood: 3, content: `Made holiday gifts at the studio — a mug for Sarah, a small planter for Marcus, a set of ornaments for my sister's tree. Glazing them in different colors. There's something about making gifts instead of buying them. It takes longer but it means more. At least it does to me.` },
  { date: '2025-12-10', color: '#1abc9c', content: `Year-end reflections starting early. I keep making lists — things I did, things I didn't, things I want. The "things I want" list is always the shortest and the hardest. I want to make things. I want to feel engaged. I want to stop saying "fine" when people ask how I am. Is that specific enough? Probably not.` },
  { date: '2025-12-18', color: '#e91e8c', mood: 4, content: `Office holiday party. Sarah surprised me by wearing earrings her girlfriend had made. My manager mentioned they're creating a new creative director role in Q1. "You should think about it," she said. I don't know if I want to direct more of the same or go do something completely different.` },
  { date: '2025-12-25', color: '#f39c12', mood: 4, content: `Christmas morning at my sister's. The kids were up at 5:30am. My nephew loved the ornaments — hung them on the tree immediately. Watched him arrange and rearrange them with total concentration. That's how I feel at the wheel. Complete focus, no self-consciousness. When do we lose that? Can we get it back?` },
  { date: '2025-12-28', color: '#2980b9', mood: 3, content: `Between Christmas and New Year's. That strange liminal week where nothing feels real. Went to the studio and made pieces without any plan — just shapes. A twisted column. A shallow dish with an uneven rim. Sometimes the best work comes when you stop trying to make something specific and just let your hands move.` },
  { date: '2025-12-31', color: '#2ecc71', mood: 3, content: `Last day of the year. Marcus, Sarah, and I did our annual tradition — dinner at the diner, then walk across the bridge at midnight. Marcus leaves for school in three weeks. Things are shifting. I told them both about the creative director role and neither of them said "that's perfect for you." That silence told me everything.` },

  // ══════════════════════════════════════════════════════
  // 2026 — The decision
  // ══════════════════════════════════════════════════════

  { date: '2026-01-04', color: '#3498db', content: `New year. I didn't make resolutions, I made one decision: apply for the creative director role but also start looking at what else is out there. Not quitting, just opening doors. Spent the morning updating my resume and realized half my accomplishments feel like they belong to someone else.` },
  { date: '2026-01-11', color: '#e67e22', mood: 2, content: `Marcus left for school. Helped him pack his apartment. When we hugged goodbye I almost cried which surprised both of us. He said "go find your thing" and I nodded like I knew what he meant. The apartment building is quieter without him. The hiking group already feels different.` },
  { date: '2026-01-18', color: '#8e44ad', mood: 4, content: `Pottery class started a new session. We're doing larger pieces now — vases, pitchers. My first vase collapsed twice before I got the walls right. The instructor said "failure is just the clay telling you to listen harder." I wrote it on a sticky note and put it on my monitor at work.` },
  { date: '2026-01-25', color: '#ff6b35', mood: 3, content: `Interview for the creative director role. It went fine. They asked where I see myself in five years and I gave the answer they wanted, not the honest one. The honest one is: I don't know, but I hope I'm making something real with my hands. That doesn't go over well in corporate interviews.` },
  { date: '2026-01-30', color: '#1abc9c', content: `Video call with Marcus. He's loving school — talking a mile a minute about zoning laws and public spaces. His enthusiasm is contagious. Told him about the interview. He said "do you want the job or do you want to want the job?" That's the question, isn't it.` },

  { date: '2026-02-05', color: '#e74c3c', mood: 2, content: `Didn't get the creative director role. They went with someone external. My manager was apologetic. I should be disappointed but honestly I felt relief, which is its own kind of answer. Sat in my car in the parking lot for twenty minutes after she told me. Not crying, not angry. Just sitting with the relief and what it means.` },
  { date: '2026-02-12', color: '#2ecc71', mood: 4, content: `Valentine's Day dinner tradition with Sarah again. Her girlfriend joined this year, which changed the dynamic but in a good way. We made ravioli from scratch. My filling was better than my pasta. Sarah asked what I'm going to do now that the promotion fell through. "Something different," I said. First time I've said it out loud.` },
  { date: '2026-02-18', color: '#f1c40f', content: `Started looking at ceramics programs. Actual programs — certificate courses, apprenticeships. There's one at the arts center that's six months, three days a week. You have to submit a portfolio and interview. My hands started sweating just reading the application. That's either terror or excitement. Maybe they're the same thing.` },
  { date: '2026-02-24', color: '#9b59b6', mood: 4, content: `My sister came over and I showed her the ceramics program website. She got quiet for a minute and then said "I've been waiting for you to find this." Apparently everyone could see it but me. She helped me photograph my pottery pieces for the portfolio. Under good lighting, they actually look like real work. Because they are.` },
  { date: '2026-02-28', color: '#27ae60', mood: 5, content: `Submitted the application. Portfolio of twelve pieces, artist statement, interview request. My hands were shaking when I clicked send. Then I went to the studio and threw the best pot I've ever made — tall, symmetrical, thin-walled. Sometimes your body knows the answer before your brain does.` },

  { date: '2026-03-01', color: '#c0392b', mood: 3, content: `Ten years at my job today. A decade. Sarah sent flowers to my desk which was sweet and also made me want to cry. Ten years of fine. I used to think loyalty was a virtue but now I wonder if it was just inertia. The ceramics program would start in September. That's six months to plan a transition. Or six months to lose my nerve.` },
  { date: '2026-03-04', color: '#3498db', mood: 4, content: `Called Marcus to tell him about the ceramics application. He literally cheered. "Finally," he said. We talked for an hour about reinvention and how scary it is to take yourself seriously. He's so much happier in school than he ever was at his old job. That gives me hope.` },
  { date: '2026-03-08', color: '#e67e22', content: `Work feels different now. Not bad, just temporary. Like I'm already leaving even though nothing has happened yet. Finished a project today and instead of satisfaction I felt impatience. Is that unfair to the people I work with? Probably. But I can't unsee what I've seen about myself.` },
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
      { date: '2006-06-10', label: 'High school graduation',           color: '#f5a623' },
      { date: '2010-05-15', label: 'College graduation',               color: '#f5a623' },
      { date: '2010-08-22', label: 'Moved into my first apartment',    color: '#f5a623' },
      { date: '2015-03-01', label: 'Started my current job',           color: '#f5a623' },
      { date: '2017-03-18', label: "Elena's wedding",                  color: '#e91e8c' },
      { date: '2019-05-18', label: 'Moved to new apartment',           color: '#f5a623' },
      { date: '2020-03-13', label: 'Pandemic lockdown begins',         color: '#c0392b' },
      { date: '2025-03-02', label: 'First pottery class',              color: '#f5a623' },
      { date: '2026-02-28', label: 'Submitted ceramics program application', color: '#2ecc71' },
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
