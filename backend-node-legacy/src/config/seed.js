'use strict';
require('dotenv').config();
const db = require('./db');

const SUBJECTS = [
  { id: 'm',   name_si: 'ඒකාබද්ධ ගණිතය', stream: 'phy', sort_order: 1 },
  { id: 'ph',  name_si: 'භෞතිකය',          stream: 'phy', sort_order: 2 },
  { id: 'ch',  name_si: 'රසායනය',           stream: 'phy', sort_order: 3 },
  { id: 'bi',  name_si: 'ජීව විද්‍යාව',      stream: 'bio', sort_order: 1 },
  { id: 'ac',  name_si: 'ගිණුම්කරණය',       stream: 'com', sort_order: 1 },
  { id: 'ec',  name_si: 'ආර්ථිකය',           stream: 'com', sort_order: 2 },
  { id: 'bs',  name_si: 'ව්‍යාපාර',            stream: 'com', sort_order: 3 },
  { id: 'hi',  name_si: 'ඉතිහාසය',           stream: 'art', sort_order: 1 },
  { id: 'po',  name_si: 'දේශපාලනය',          stream: 'art', sort_order: 2 },
  { id: 'ge',  name_si: 'භූගෝලය',            stream: 'art', sort_order: 3 },
  { id: 'ict', name_si: 'ICT',               stream: 'tec', sort_order: 1 },
  { id: 'et',  name_si: 'ඉංජිනේරු',          stream: 'tec', sort_order: 2 },
  { id: 'sc',  name_si: 'විද්‍යාව',            stream: 'tec', sort_order: 3 },
];

const TOPICS = {
  m:  ['ශ්‍රේණි හා ශ්‍රේණිල','අවකලනය','අනුකලනය','දෛශික','සංකීර්ණ සංඛ්‍යා','ත්‍රිකෝණමිති','ප්‍රස්තාර','සංඛ්‍යාන','ඝාතාංක'],
  ph: ['නිව්ටන් ගතිකය','ශක්තිය හා කාර්යය','තරංග','ප්‍රකාශ','ෙවද්‍යුත්','ගෑස් නිතිය','නවීන භෞතිකය','කාලීකය'],
  ch: ['ස්ථිතිකලා','රසායනික සංස්ථා','කාබනික','ලෝහ','විද්‍යුත් රසායනය','ඔක්සිකරණය','pH හා buffer'],
  bi: ['සෛල ජීව විද්‍යාව','ජාන','පරිණාමය','ශාක','සතුන්','ජෛව රසායනය','ජීවය හා පරිසරය'],
  ac: ['ගිණුම් සමීකරණය','ජර්නල් හා ලෙජර','ශේෂ ලේඛනය','ලාභ හා අලාභ','ස්ථාවර වත්කම','හවුල් ව්‍යාපාර','සමාගම් ගිණුම්'],
  ec: ['ඉල්ලුම හා සැපයුම','නිෂ්පාදන','GDP','ව්‍යවහාර ශේෂය','මූල්‍ය ප්‍රතිපත්ති','ශ්‍රී ලංකා ආර්ථිකය','ජාත්‍යන්තර'],
  bs: ['ව්‍යාපාර ආකෘති','වෙළඳාම','රක්ෂණය','ව්‍යාපාර ලේඛන','ව්‍යාපාර මූල්‍ය'],
  hi: ['ශ්‍රී ලංකා ඉතිහාසය','ආසියා ඉතිහාසය','යුරෝපා ඉතිහාසය','නූතන ඉතිහාසය'],
  po: ['ශ්‍රී ලංකා ආණ්ඩුව','ප්‍රජාතන්ත්‍රවාදය','ජාත්‍යන්තර සබඳතා','දේශීය දේශපාලනය'],
  ge: ['භූ රූප','දේශගුණය','ජනගහනය','ශ්‍රී ලංකා භූගෝලය'],
  ict: ['Hardware','Software','Networks','Databases','Programming','Web','Cybersecurity'],
  et: ['Mechanics','Electronics','Materials','Energy','Engineering Drawing'],
  sc: ['Chemistry basics','Physics basics','Biology basics','Environmental Science'],
};

async function seed() {
  console.log('▶ Seeding database…');
  try {
    // Subjects
    for (const s of SUBJECTS) {
      await db.query(
        `INSERT INTO subjects (id, name_si, stream, sort_order)
         VALUES ($1,$2,$3::stream_enum,$4)
         ON CONFLICT (id) DO UPDATE SET name_si=$2, stream=$3::stream_enum`,
        [s.id, s.name_si, s.stream, s.sort_order]
      );
    }
    console.log(`  ✓ ${SUBJECTS.length} subjects`);

    // Topics
    let topicCount = 0;
    for (const [subjId, topicNames] of Object.entries(TOPICS)) {
      for (let i = 0; i < topicNames.length; i++) {
        await db.query(
          `INSERT INTO topics (subject_id, name_si, sort_order)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [subjId, topicNames[i], i + 1]
        );
        topicCount++;
      }
    }
    console.log(`  ✓ ${topicCount} topics`);

    // Admin user (change password in production!)
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Admin@2026!', 12);
    await db.query(
      `INSERT INTO users (mobile, name, password_hash, role, is_verified)
       VALUES ($1,$2,$3,'admin',TRUE)
       ON CONFLICT (mobile) DO NOTHING`,
      ['+94770000000', 'Kombuwaedu Admin', hash]
    );
    console.log('  ✓ Admin user (+94770000000 / Admin@2026!)');

    console.log('✅ Seed complete');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

seed();
