// ─── State ──────────────────────────────────────────────────────────

let characters = [];
let strings = {};
let skillMap = {};
let buffMap = {};
let charTags = {};  // charId -> { buffs: Set, debuffs: Set }

let filterElement = 'all';
let filterClass = 'all';
let filterRarity = 'all';
let filterTags = new Set();
let searchQuery = '';
let sortBy = 'rarity';

const RARITY_MAP = { 1: 'R', 2: 'SR', 3: 'SSR', 4: 'SSR+' };

// ─── Spine2D manifest ─────────────────────────────────────────────
// All characters combine 'default' + 'armor_1' skins for the complete model
const SPINE_DATA = {
  1101: { jsonUrl: 'spine/1101/Kagura_Spine2D_Export_R_1.json', atlasUrl: 'spine/1101/Kagura_Spine2D_Export_R_1.atlas' },
  1102: { jsonUrl: 'spine/1102/Ayumi_Spine2D_Export_R_10.json', atlasUrl: 'spine/1102/Ayumi_Spine2D_Export_R_10.atlas' },
  1103: { jsonUrl: 'spine/1103/Chika_Spine2D_Export_R_3.json', atlasUrl: 'spine/1103/Chika_Spine2D_Export_R_3.atlas' },
  1104: { jsonUrl: 'spine/1104/Kanade_Spine2D_Export_R_16.json', atlasUrl: 'spine/1104/Kanade_Spine2D_Export_R_16.atlas' },
  1105: { jsonUrl: 'spine/1105/Hinata_Spine2D_Export_R_13.json', atlasUrl: 'spine/1105/Hinata_Spine2D_Export_R_13.atlas' },
  1106: { jsonUrl: 'spine/1106/Sae_Spine2D_Export_R_4.json', atlasUrl: 'spine/1106/Sae_Spine2D_Export_R_4.atlas' },
  1107: { jsonUrl: 'spine/1107/Emiko_Spine2D_Export_R_7.json', atlasUrl: 'spine/1107/Emiko_Spine2D_Export_R_7.atlas' },
  1108: { jsonUrl: 'spine/1108/Lisa_Spine2D_Export_R_8.json', atlasUrl: 'spine/1108/Lisa_Spine2D_Export_R_8.atlas' },
  2101: { jsonUrl: 'spine/2101/Yukino_Spine2D_Export_R_9.json', atlasUrl: 'spine/2101/Yukino_Spine2D_Export_R_9.atlas' },
  2102: { jsonUrl: 'spine/2102/Hiyori_Spine2D_Export_R_2.json', atlasUrl: 'spine/2102/Hiyori_Spine2D_Export_R_2.atlas' },
  2103: { jsonUrl: 'spine/2103/Kiyomi_Spine2D_Export_R_11.json', atlasUrl: 'spine/2103/Kiyomi_Spine2D_Export_R_11.atlas' },
  2104: { jsonUrl: 'spine/2104/Nanako_Spine2D_Export_R_12.json', atlasUrl: 'spine/2104/Nanako_Spine2D_Export_R_12.atlas' },
  2105: { jsonUrl: 'spine/2105/Kirie_Spine2D_Export_R_5.json', atlasUrl: 'spine/2105/Kirie_Spine2D_Export_R_5.atlas' },
  2106: { jsonUrl: 'spine/2106/Marina_Spine2D_Export_R_14.json', atlasUrl: 'spine/2106/Marina_Spine2D_Export_R_14.atlas' },
  2107: { jsonUrl: 'spine/2107/Azusa_Spine2D_Export_R_15.json', atlasUrl: 'spine/2107/Azusa_Spine2D_Export_R_15.atlas' },
  2108: { jsonUrl: 'spine/2108/Akane_Spine2D_Export_R_6.json', atlasUrl: 'spine/2108/Akane_Spine2D_Export_R_6.atlas' },
  3101: { jsonUrl: 'spine/3101/Nanami_Spine2D_Export_20.json', atlasUrl: 'spine/3101/Nanami_Spine2D_Export_20.atlas' },
  3102: { jsonUrl: 'spine/3102/Kana_Spine2D_Export_29.json', atlasUrl: 'spine/3102/Kana_Spine2D_Export_29.atlas' },
  3103: { jsonUrl: 'spine/3103/Tsubasa_Spine2D_Export_12.json', atlasUrl: 'spine/3103/Tsubasa_Spine2D_Export_12.atlas' },
  3104: { jsonUrl: 'spine/3104/Naomi_Spine2D_Export_13.json', atlasUrl: 'spine/3104/Naomi_Spine2D_Export_13.atlas' },
  3105: { jsonUrl: 'spine/3105/Misaki_Spine2D_Export_14.json', atlasUrl: 'spine/3105/Misaki_Spine2D_Export_14.atlas' },
  3106: { jsonUrl: 'spine/3106/Ayaka_Spine2D_Export_15.json', atlasUrl: 'spine/3106/Ayaka_Spine2D_Export_15.atlas', viewport: { x: -459, y: 200, width: 1400, height: 2500 }, zoom: 0.9 },
  3107: { jsonUrl: 'spine/3107/Aoi_Spine2D_Export_16.json', atlasUrl: 'spine/3107/Aoi_Spine2D_Export_16.atlas' },
  3108: { jsonUrl: 'spine/3108/Kuro_Spine2D_Export_30.json', atlasUrl: 'spine/3108/Kuro_Spine2D_Export_30.atlas' },
  3109: { jsonUrl: 'spine/3109/Maiko_Spine2D_Export_26.json', atlasUrl: 'spine/3109/Maiko_Spine2D_Export_26.atlas', viewport: { x: -479, y: 300, width: 1320, height: 2700 }, zoom: 0.8 },
  3110: { jsonUrl: 'spine/3110/Misato_Spine2D_Export_17.json', atlasUrl: 'spine/3110/Misato_Spine2D_Export_17.atlas' },
  3111: { jsonUrl: 'spine/3111/Savannah_Spine2D_Export_19.json', atlasUrl: 'spine/3111/Savannah_Spine2D_Export_19.atlas' },
  3112: { jsonUrl: 'spine/3112/Yui_Spine2D_Export_21.json', atlasUrl: 'spine/3112/Yui_Spine2D_Export_21.atlas' },
  4101: { jsonUrl: 'spine/4101/Ayame_Spine2D_Export_18.json', atlasUrl: 'spine/4101/Ayame_Spine2D_Export_18.atlas', viewport: { x: -867, y: 188, width: 1533, height: 2771 } },
  4102: { jsonUrl: 'spine/4102/Sayo_Spine2D_Export_2.json', atlasUrl: 'spine/4102/Sayo_Spine2D_Export_2.atlas', viewport: { x: -586, y: 192, width: 1463, height: 3139 } },
  4103: { jsonUrl: 'spine/4103/Coco_Spine2D_Export_4.json', atlasUrl: 'spine/4103/Coco_Spine2D_Export_4.atlas', viewport: { x: -662, y: 165, width: 1523, height: 2588 } },
  4104: { jsonUrl: 'spine/4104/Kaori_Spine2D_Export_5.json', atlasUrl: 'spine/4104/Kaori_Spine2D_Export_5.atlas', viewport: { x: -651, y: 157, width: 1462, height: 3187 } },
  4105: { jsonUrl: 'spine/4105/Miyuki_Spine2D_Export_31.json', atlasUrl: 'spine/4105/Miyuki_Spine2D_Export_31.atlas', viewport: { x: -1085, y: 160, width: 2681, height: 3661 } },
  4106: { jsonUrl: 'spine/4106/Hina_Spine2D_Export_6.json', atlasUrl: 'spine/4106/Hina_Spine2D_Export_6.atlas', viewport: { x: -1259, y: 80, width: 2310, height: 3216 } },
  4107: { jsonUrl: 'spine/4107/Tomoe_Spine2D_Export_22.json', atlasUrl: 'spine/4107/Tomoe_Spine2D_Export_22.atlas', viewport: { x: -774, y: 102, width: 2008, height: 3434 } },
  4108: { jsonUrl: 'spine/4108/Nova_Spine2D_Export_27.json', atlasUrl: 'spine/4108/Nova_Spine2D_Export_27.atlas', viewport: { x: -1122, y: 38, width: 2230, height: 2938 } },
  4109: { jsonUrl: 'spine/4109/Lina_Spine2D_Export_23.json', atlasUrl: 'spine/4109/Lina_Spine2D_Export_23.atlas', viewport: { x: -1204, y: 114, width: 2365, height: 2913 } },
  4110: { jsonUrl: 'spine/4110/Lexi_Spine2D_Export_28.json', atlasUrl: 'spine/4110/Lexi_Spine2D_Export_28.atlas', viewport: { x: -1005, y: 138, width: 1705, height: 3199 } },
  4111: { jsonUrl: 'spine/4111/Sayuri_Spine2D_Export_7.json', atlasUrl: 'spine/4111/Sayuri_Spine2D_Export_7.atlas', viewport: { x: -868, y: 52, width: 1689, height: 3029 } },
  4112: { jsonUrl: 'spine/4112/Aria_Spine2D_Export_24.json', atlasUrl: 'spine/4112/Aria_Spine2D_Export_24.atlas', viewport: { x: -733, y: 72, width: 1527, height: 2955 } },
  4113: { jsonUrl: 'spine/4113/Jass_Spine2D_Export_8.json', atlasUrl: 'spine/4113/Jass_Spine2D_Export_8.atlas', viewport: { x: -1472, y: 150, width: 2629, height: 3634 } },
  4114: { jsonUrl: 'spine/4114/Chihiro_Spine2D_Export_9.json', atlasUrl: 'spine/4114/Chihiro_Spine2D_Export_9.atlas', viewport: { x: -794, y: -3, width: 1371, height: 2281 } },
  4115: { jsonUrl: 'spine/4115/Haruna_Spine2D_Export_25.json', atlasUrl: 'spine/4115/Haruna_Spine2D_Export_25.atlas', viewport: { x: -903, y: 129, width: 1789, height: 2980 } },
  4116: { jsonUrl: 'spine/4116/Reina_Spine2D_Export_32.json', atlasUrl: 'spine/4116/Reina_Spine2D_Export_32.atlas', viewport: { x: -691, y: 71, width: 1591, height: 2876 } },
  4117: { jsonUrl: 'spine/4117/Yuzuki_Spine2D_Export_1.json', atlasUrl: 'spine/4117/Yuzuki_Spine2D_Export_1.atlas', viewport: { x: -811, y: 95, width: 1718, height: 3211 } },
  4118: { jsonUrl: 'spine/4118/Parin_Spine2D_Export_10.json', atlasUrl: 'spine/4118/Parin_Spine2D_Export_10.atlas', viewport: { x: -984, y: 262, width: 2009, height: 3460 } },
  4119: { jsonUrl: 'spine/4119/Sayaka_Spine2D_Export_11.json', atlasUrl: 'spine/4119/Sayaka_Spine2D_Export_11.atlas', viewport: { x: -1281, y: 394, width: 2677, height: 2345 }, zoom: 0.78 },
  4120: { jsonUrl: 'spine/4120/Dana_Spine2D_Export_3.json', atlasUrl: 'spine/4120/Dana_Spine2D_Export_3.atlas', viewport: { x: -1046, y: 296, width: 2123, height: 2946 }, zoom: 1 },
  4121: { jsonUrl: 'spine/4121/Miko_Spine2D_Export_33.json', atlasUrl: 'spine/4121/Miko_Spine2D_Export_33.atlas', viewport: { x: -1267, y: -98, width: 2460, height: 2808 } },
  4122: { jsonUrl: 'spine/4122/Shion_Spine2D_Export_34.json', atlasUrl: 'spine/4122/Shion_Spine2D_Export_34.atlas', viewport: { x: -1167, y: -37, width: 2163, height: 2943 } },
  4123: { jsonUrl: 'spine/4123/Asuka_Spine2D_Export_35.json', atlasUrl: 'spine/4123/Asuka_Spine2D_Export_35.atlas', viewport: { x: -348, y: 47, width: 1291, height: 2916 } },
  4124: { jsonUrl: 'spine/4124/Shua_Spine2D_Export_43.json', atlasUrl: 'spine/4124/Shua_Spine2D_Export_43.atlas' },
  4125: { jsonUrl: 'spine/4125/Soyul_Spine2D_Export_44.json', atlasUrl: 'spine/4125/Soyul_Spine2D_Export_44.atlas' },
  4128: { jsonUrl: 'spine/4128/Kazura_Spine2D_Export_45.json', atlasUrl: 'spine/4128/Kazura_Spine2D_Export_45.atlas', viewport: { x: -1008, y: 129, width: 1741, height: 2881 } },
  4154: { jsonUrl: 'spine/4154/Karasuya_Spine2D_Export_53.json', atlasUrl: 'spine/4154/Karasuya_Spine2D_Export_53.atlas', viewport: { x: -718, y: -44, width: 1278, height: 2139 }, zoom: 1 },
  4155: { jsonUrl: 'spine/4155/Lezbianca_Spine2D_Export_54.json', atlasUrl: 'spine/4155/Lezbianca_Spine2D_Export_54.atlas', viewport: { x: -1271, y: -8, width: 2280, height: 3846 } },
  4157: { jsonUrl: 'spine/4157/Lian_Spine2D_Export_57.json', atlasUrl: 'spine/4157/Lian_Spine2D_Export_57.atlas', viewport: { x: -702, y: -12, width: 1403, height: 2849 } },
  4158: { jsonUrl: 'spine/4158/Raven_Spine2D_Export_58.json', atlasUrl: 'spine/4158/Raven_Spine2D_Export_58.atlas', viewport: { x: -897, y: -100, width: 1794, height: 3355 }, zoom: 1.15 },
  7101: { jsonUrl: 'spine/7101/Kuro_summer_Spine2D_Export.json', atlasUrl: 'spine/7101/Kuro_summer_Spine2D_Export.atlas', viewport: { x: -898, y: 187, width: 1533, height: 2921 } },
  7102: { jsonUrl: 'spine/7102/kagura_summer_spine2d_export.json', atlasUrl: 'spine/7102/kagura_summer_spine2d_export.atlas', viewport: { x: -1016, y: 110, width: 1750, height: 2915 }, zoom: 1 },
  7103: { jsonUrl: 'spine/7103/hiyori_summer_spine2d.json', atlasUrl: 'spine/7103/hiyori_summer_spine2d.atlas', viewport: { x: -648, y: 63, width: 1495, height: 2967 } },
  7104: { jsonUrl: 'spine/7104/emiko_summer_spine2d_export.json', atlasUrl: 'spine/7104/emiko_summer_spine2d_export.atlas', viewport: { x: -1133, y: 79, width: 2019, height: 2814 } },
  7105: { jsonUrl: 'spine/7105/Hinata_summer_Spine2D_Export.json', atlasUrl: 'spine/7105/Hinata_summer_Spine2D_Export.atlas', viewport: { x: -840, y: 149, width: 1521, height: 2892 } },
  7106: { jsonUrl: 'spine/7106/Kirie_summer_spine2d_export.json', atlasUrl: 'spine/7106/Kirie_summer_spine2d_export.atlas', viewport: { x: -683, y: 150, width: 1535, height: 2987 } },
  7107: { jsonUrl: 'spine/7107/Garin_Spine2D_Export_49.json', atlasUrl: 'spine/7107/Garin_Spine2D_Export_49.atlas', viewport: { x: -506, y: 91, width: 927, height: 2971 } },
  7108: { jsonUrl: 'spine/7108/Umbae_Spine2D_Export_50.json', atlasUrl: 'spine/7108/Umbae_Spine2D_Export_50.atlas', viewport: { x: -716, y: 73, width: 1443, height: 2871 } },
  7109: { jsonUrl: 'spine/7109/Naomi_special_Spine2D_Export.json', atlasUrl: 'spine/7109/Naomi_special_Spine2D_Export.atlas', viewport: { x: -944, y: 26, width: 1856, height: 3036 } },
  7110: { jsonUrl: 'spine/7110/Kuro_special_Spine2D_Export.json', atlasUrl: 'spine/7110/Kuro_special_Spine2D_Export.atlas', viewport: { x: -531, y: 97, width: 1327, height: 3208 } },
  7119: { jsonUrl: 'spine/7119/Rika_bm_Spine2D_export.json', atlasUrl: 'spine/7119/Rika_bm_Spine2D_export.atlas' },
  7111: { jsonUrl: 'spine/7111/Deandra_bm_spine2d_export.json', atlasUrl: 'spine/7111/Deandra_bm_spine2d_export.atlas' },
  7116: { jsonUrl: 'spine/7116/Symmetra_bm_spine2d_export.json', atlasUrl: 'spine/7116/Symmetra_bm_spine2d_export.atlas', viewport: { x: -822, y: 32, width: 1673, height: 2113 } },
  7117: { jsonUrl: 'spine/7117/Teresa_bm_spine2d_export.json', atlasUrl: 'spine/7117/Teresa_bm_spine2d_export.atlas', viewport: { x: -643, y: 68, width: 1200, height: 2000 } },
  7120: { jsonUrl: 'spine/7120/Akane_summer_Spine2D_Export.json', atlasUrl: 'spine/7120/Akane_summer_Spine2D_Export.atlas', viewport: { x: -665, y: 122, width: 1053, height: 2800 } },
};
const RARITY_CLASS = { 1: 'r', 2: 'sr', 3: 'ssr', 4: 'ssr-plus' };
const ELEMENT_ID = { Fire: 1, Water: 2, Wind: 3, Light: 4, Dark: 5 };
const BANNER_TYPE_LABELS = { pickup: 'Pick Up', limited: 'Limited', special: 'Special', seasonal: 'Seasonal', event: 'Event', raid: 'Raid', trial: 'Trial' };

// ─── Data Loading ───────────────────────────────────────────────────

async function loadData() {
  const [charsData, stringsData, skillsData, buffsData] = await Promise.all([
    fetch('../data/characters.json?v=2').then(r => r.json()),
    fetch('../data/strings.json?v=2').then(r => r.json()),
    fetch('../data/skills.json?v=2').then(r => r.json()),
    fetch('../data/skill_buffs.json?v=2').then(r => r.json()),
  ]);

  characters = charsData;
  strings = stringsData;
  skillsData.forEach(s => skillMap[s.id] = s);
  buffsData.forEach(b => buffMap[b.id] = b);

  buildCharTags();
  buildTagFilters();
  render();
}

// ─── Tag System ─────────────────────────────────────────────────────
// Manual override map — scraped game data has incorrect/inconsistent buff/debuff
// labels, so these are verified against what the player actually sees in-game.

const CHAR_TAGS = {
  // Kagura (Fire Supporter)
  1101: { buffs: ['ATK Buff'], debuffs: ['ATK Debuff'] },
  // Ayumi (Water Defender)
  1102: { buffs: ['ATK Buff'], debuffs: ['ATK Debuff'] },
  // Chika (Water Supporter)
  1103: { buffs: ['Shield'], debuffs: [] },
  // Kanade (Wind Fighter)
  1104: { buffs: [], debuffs: [] },
  // Hinata (Fire Defender)
  1105: { buffs: ['Heal', 'ATK Buff'], debuffs: [] },
  // Sae (Water Healer)
  1106: { buffs: ['Heal'], debuffs: [] },
  // Emiko (Wind Supporter)
  1107: { buffs: ['Heal'], debuffs: ['ATK Debuff'] },
  // Lisa (Wind Assassin)
  1108: { buffs: [], debuffs: [] },
  // Yukino (Water Healer)
  2101: { buffs: ['Heal'], debuffs: [] },
  // Hiyori (Wind Fighter)
  2102: { buffs: [], debuffs: [] },
  // Kiyomi (Wind Healer)
  2103: { buffs: ['Heal'], debuffs: [] },
  // Nanako (Fire Fighter)
  2104: { buffs: [], debuffs: [] },
  // Kirié (Dark Assassin)
  2105: { buffs: [], debuffs: [] },
  // Marina (Water Defender)
  2106: { buffs: ['DEF Buff'], debuffs: [] },
  // Azusa (Fire Fighter)
  2107: { buffs: [], debuffs: ['Burn'] },
  // Akane (Light Assassin)
  2108: { buffs: [], debuffs: [] },
  // Nanami (Wind Defender)
  3101: { buffs: [], debuffs: ['Accuracy Debuff (Passive)'] },
  // Kana (Fire Defender)
  3102: { buffs: ['Self Heal'], debuffs: ['Burn'] },
  // Tsubasa (Wind Fighter)
  3103: { buffs: [], debuffs: [] },
  // Naomi (Water Assassin)
  3104: { buffs: [], debuffs: [] },
  // Misaki (Water Healer)
  3105: { buffs: ['Heal', 'DEF Buff'], debuffs: [] },
  // Ayaka (Fire Fighter)
  3106: { buffs: [], debuffs: [] },
  // Aoi (Light Assassin)
  3107: { buffs: ['Heal'], debuffs: ['ATK Debuff'] },
  // Kuro (Dark Fighter)
  3108: { buffs: [], debuffs: ['Bleed'] },
  // Maiko (Water Fighter)
  3109: { buffs: [], debuffs: ['Freeze'] },
  // Misato (Water Supporter)
  3110: { buffs: [], debuffs: ['Freeze', 'DEF Debuff (Passive)', 'Gauge Reduce'] },
  // Savannah (Fire Assassin)
  3111: { buffs: [], debuffs: ['Burn'] },
  // Yui (Wind Healer)
  3112: { buffs: ['Heal', 'Shield', 'ATK Buff', 'DEF Buff', 'Evasion Buff (Passive)', 'Resurrect'], debuffs: [] },
  // Ayame (Wind Supporter)
  4101: { buffs: ['Gauge Recovery'], debuffs: ['Unhealable', 'Buff Remove', 'SPD Debuff (Passive)'] },
  // Sayo (Light Healer)
  4102: { buffs: ['Heal Over Time', 'Resurrect', 'HP Buff (Passive)', 'Heal', 'Cleanse'], debuffs: [] },
  // Coco (Fire Defender)
  4103: { buffs: ['Self Heal', 'DEF Buff'], debuffs: ['Stun'] },
  // Kaori (Water Supporter)
  4104: { buffs: ['ATK Buff'], debuffs: ['ATK Debuff'] },
  // Miyuki (Fire Fighter)
  4105: { buffs: ['Self Heal', 'ATK Buff (Self)'], debuffs: [] },
  // Hina (Water Healer)
  4106: { buffs: ['Heal', 'Cleanse'], debuffs: [] },
  // Tomoe (Fire Healer)
  4107: { buffs: ['Heal', 'Shield'], debuffs: [] },
  // Nova (Fire Defender)
  4108: { buffs: ['Shield', 'DEF Buff (Passive)'], debuffs: ['ATK Debuff'] },
  // Lina (Fire Fighter)
  4109: { buffs: ['ATK Buff (Self)'], debuffs: [] },
  // Lexi (Light Assassin)
  4110: { buffs: ['CRIT Rate Buff (Passive)'], debuffs: ['Resurrection Ban', 'Targeting'] },
  // Sayuri (Dark Fighter)
  4111: { buffs: ['Accuracy Buff (Passive)'], debuffs: ['Stun'] },
  // Aria (Wind Supporter)
  4112: { buffs: ['DEF Buff', 'Shield', 'CRIT Rate Buff', 'CRIT DMG Buff'], debuffs: ['Shield Remove'] },
  // Jass (Dark Assassin)
  4113: { buffs: [], debuffs: ['Poison'] },
  // Chihiro (Wind Supporter)
  4114: { buffs: ['ATK Buff', 'DEF Buff', 'Heal'], debuffs: ['Buff Remove', 'Stun'] },
  // Haruna (Wind Defender)
  4115: { buffs: ['DEF Buff', 'Shield'], debuffs: ['Bleed'] },
  // Reina (Water Fighter)
  4116: { buffs: [], debuffs: ['Freeze'] },
  // Yuzuki (Light Defender)
  4117: { buffs: ['Resurrect'], debuffs: ['Stun', 'ATK Debuff (Passive)'] },
  // Parin (Water Assassin)
  4118: { buffs: [], debuffs: ['Resurrection Ban', 'Bleed'] },
  // Sayaka (Dark Assassin)
  4119: { buffs: ['Self Heal', 'ATK Buff (Self)'], debuffs: ['Unhealable', 'ATK Debuff', 'DEF Debuff'] },
  // Dana (Light Defender)
  4120: { buffs: ['Resurrect', 'DEF Buff', 'DEF Buff (Passive)', 'Shield'], debuffs: ['Stun'] },
  // Miko (Fire Supporter)
  4121: { buffs: ['ATK Buff'], debuffs: ['Burn', 'Buff Remove', 'Stun'] },
  // Shion (Water Fighter)
  4122: { buffs: [], debuffs: ['Attribute Curse (Water)', 'ATK Debuff (Passive)', 'Freeze'] },
  // Asuka (Light Fighter)
  4123: { buffs: [], debuffs: ['Bleed'] },
  // Shua (Water Healer)
  4124: { buffs: ['Heal', 'Heal Over Time', 'Shield', 'Crowd Control Shield', 'DEF Buff (Passive)'], debuffs: [] },
  // Soyul (Wind Fighter)
  4125: { buffs: [], debuffs: ['Bleed', 'Evasion Debuff', 'Accuracy Debuff'] },
  // Kazura (Fire Defender)
  4128: { buffs: ['Taunt', 'Resurrect', 'ATK Buff (Self)'], debuffs: [] },
  // Karasuya (Dark Supporter)
  4154: { buffs: ['Shield', 'CRIT Rate Buff', 'CRIT DMG Buff', 'Gauge Recovery'], debuffs: ['Targeting', 'ATK Debuff'] },
  // Lezbianca (Light Fighter)
  4155: { buffs: ['ATK Buff (Self)'], debuffs: ['Punishment'] },
  // Lian (Wind Assassin)
  4157: { buffs: [], debuffs: ['Bleed'] },
  // Kuro(Summer) (Wind Fighter)
  7101: { buffs: [], debuffs: ['Bleed', 'Freeze', 'Burn', 'Stun'] },
  // Kagura(Summer) (Fire Fighter)
  7102: { buffs: [], debuffs: ['Burn'] },
  // Hiyori(Summer) (Water Healer)
  7103: { buffs: ['Heal', 'Cleanse'], debuffs: ['Freeze'] },
  // Emiko(Summer) (Wind Supporter)
  7104: { buffs: ['Gauge Recovery'], debuffs: ['Bleed', 'Gauge Reduce'] },
  // Hinata(Summer) (Light Defender)
  7105: { buffs: ['HP Buff', 'Heal Over Time'], debuffs: ['Stun', 'ATK Debuff'] },
  // Kirie(Summer) (Dark Assassin)
  7106: { buffs: [], debuffs: ['Bleed'] },
  // Garin (Dark Supporter)
  7107: { buffs: [], debuffs: ['Unhealable', 'Resurrection Ban', 'Evasion Debuff (Passive)', 'Stun'] },
  // Umbae (Dark Supporter)
  7108: { buffs: ['ATK Buff', 'Shield'], debuffs: ['Charm', 'Accuracy Debuff', 'DEF Debuff'] },
  // Naomi(Chosen) (Water Fighter)
  7109: { buffs: ['ATK Buff'], debuffs: ['Buff Remove', 'Gauge Reduce'] },
  // Kuro(Curvy) (Dark Fighter)
  7110: { buffs: [], debuffs: ['Stun', 'Bleed', 'Freeze', 'Burn'] },
  // Rika (Water Fighter)
  7119: { buffs: ['HP Buff (Passive)'], debuffs: ['Freeze'] },
  // Deandra (Fire Defender)
  7111: { buffs: ['ATK Buff (Passive)'], debuffs: ['Burn'] },
  // Symmetra (Fire Fighter)
  7116: { buffs: ['ATK Buff (Passive)'], debuffs: ['Bleed'] },
  // Teresa (Dark Assassin)
  7117: { buffs: ['Evasion Buff (Passive)'], debuffs: ['Stun', 'Burn'] },
  // Akane(Summer) (Light Supporter)
  7120: { buffs: ['Gauge Recovery'], debuffs: ['Stun', 'Accuracy Debuff', 'Charm'] },
};

function buildCharTags() {
  const allBuffTags = new Set();
  const allDebuffTags = new Set();

  characters.forEach(c => {
    const entry = CHAR_TAGS[c.id];
    const buffs = new Set(entry ? entry.buffs : []);
    const debuffs = new Set(entry ? entry.debuffs : []);

    charTags[c.id] = { buffs, debuffs };
    buffs.forEach(t => allBuffTags.add(t));
    debuffs.forEach(t => allDebuffTags.add(t));
  });

  return { allBuffTags, allDebuffTags };
}

function buildTagFilters() {
  const { allBuffTags, allDebuffTags } = buildCharTags();

  fillTagContainer('buff-tags', [...allBuffTags].sort());
  fillTagContainer('debuff-tags', [...allDebuffTags].sort());
}

function fillTagContainer(containerId, tags) {
  const container = document.getElementById(containerId);
  const pills = document.createElement('div');
  pills.className = 'filter-pills';
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'pill tag-pill';
    btn.dataset.value = tag;
    btn.textContent = tag;
    btn.addEventListener('click', () => toggleTag(tag, btn));
    pills.appendChild(btn);
  });
  container.replaceChildren(pills);
}

// ─── Filtering & Sorting ───────────────────────────────────────────

function getName(c) {
  return strings[c.nameIndex] || ('Char #' + c.id);
}

function getFiltered() {
  let list = characters.filter(c => {
    if (filterElement !== 'all' && c.element !== filterElement) return false;
    if (filterClass !== 'all' && c.class !== filterClass) return false;
    if (filterRarity !== 'all' && c.boneStar !== parseInt(filterRarity)) return false;
    if (searchQuery) {
      const name = getName(c).toLowerCase();
      if (!name.includes(searchQuery)) return false;
    }
    if (filterTags.size > 0) {
      const ct = charTags[c.id];
      const allTags = new Set([...ct.buffs, ...ct.debuffs]);
      for (const t of filterTags) {
        if (!allTags.has(t)) return false;
      }
    }
    return true;
  });

  list.sort((a, b) => {
    switch (sortBy) {
      case 'name':    return getName(a).localeCompare(getName(b));
      case 'element': return a.element.localeCompare(b.element) || getName(a).localeCompare(getName(b));
      case 'class':   return a.class.localeCompare(b.class) || getName(a).localeCompare(getName(b));
      case 'rarity':  return b.boneStar - a.boneStar || getName(a).localeCompare(getName(b));
      case 'id':      return a.id - b.id;
      default:        return 0;
    }
  });

  return list;
}

// ─── Rendering ──────────────────────────────────────────────────────

function renderCard(c) {
  const name = getName(c);
  const rarityText = RARITY_MAP[c.boneStar] || '?';
  const rarityClass = RARITY_CLASS[c.boneStar] || '';

  const card = document.createElement('div');
  card.className = 'char-card';

  const img = document.createElement('img');
  img.src = '../data/portraits/char_tex_' + c.id + '.png';
  img.alt = name;
  img.loading = 'lazy';
  card.appendChild(img);

  // Top bar: rarity + class (left), element icon (right)
  const topMeta = document.createElement('div');
  topMeta.className = 'card-top-meta';

  const rarityEl = document.createElement('span');
  rarityEl.className = 'card-rarity ' + rarityClass;
  rarityEl.textContent = rarityText;
  topMeta.appendChild(rarityEl);

  const classEl = document.createElement('span');
  classEl.className = 'card-class';
  classEl.textContent = c.class;
  topMeta.appendChild(classEl);

  card.appendChild(topMeta);

  const elIcon = document.createElement('img');
  elIcon.className = 'card-element-icon';
  elIcon.src = '../data/icons/element_' + ELEMENT_ID[c.element] + '.png';
  elIcon.alt = c.element;
  card.appendChild(elIcon);

  // Bottom: name only
  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = name;
  overlay.appendChild(nameEl);

  card.appendChild(overlay);

  card.addEventListener('click', () => openDetail(c));
  if (SPINE_DATA[c.id]) {
    card.addEventListener('mouseenter', () => preloadSpine(c.id), { once: true });
  }

  return card;
}

function render() {
  const grid = document.getElementById('erodex-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('results-count');

  const filtered = getFiltered();

  grid.replaceChildren();
  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    count.textContent = '';
  } else {
    empty.classList.add('hidden');
    count.textContent = filtered.length + ' character' + (filtered.length !== 1 ? 's' : '');
    const frag = document.createDocumentFragment();
    filtered.forEach(c => frag.appendChild(renderCard(c)));
    grid.appendChild(frag);
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────

function setupFilterGroup(containerId, callback) {
  const container = document.getElementById(containerId);
  container.addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (!btn || btn.classList.contains('tag-pill')) return;
    container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    callback(btn.dataset.value);
    render();
  });
}

function toggleTag(tag, btn) {
  if (filterTags.has(tag)) {
    filterTags.delete(tag);
    btn.classList.remove('active');
  } else {
    filterTags.add(tag);
    btn.classList.add('active');
  }
  updateTagCounts();
  render();
}

function updateTagCounts() {
  // Count active tags in each section
  const buffCount = document.querySelectorAll('#buff-tags .tag-pill.active').length;
  const debuffCount = document.querySelectorAll('#debuff-tags .tag-pill.active').length;

  const buffLabel = document.getElementById('buff-count');
  const debuffLabel = document.getElementById('debuff-count');

  buffLabel.textContent = buffCount > 0 ? buffCount + ' active' : '';
  buffLabel.classList.toggle('has-active', buffCount > 0);

  debuffLabel.textContent = debuffCount > 0 ? debuffCount + ' active' : '';
  debuffLabel.classList.toggle('has-active', debuffCount > 0);
}

// Collapsible toggles
function setupCollapsible(toggleId, bodyId) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);

  toggle.addEventListener('click', () => {
    const section = toggle.closest('.collapsible');
    const isOpen = section.classList.toggle('open');
    body.classList.toggle('hidden', !isOpen);
  });
}

// Search
document.getElementById('search').addEventListener('input', e => {
  searchQuery = e.target.value.trim().toLowerCase();
  render();
});

// Filter groups
setupFilterGroup('element-filters', v => { filterElement = v; });
setupFilterGroup('class-filters', v => { filterClass = v; });
setupFilterGroup('rarity-filters', v => { filterRarity = v; });

// Sort
document.getElementById('sort-options').addEventListener('click', e => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  document.querySelectorAll('#sort-options .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  sortBy = btn.dataset.value;
  document.getElementById('sort-label').textContent = btn.textContent;
  render();
});

// Collapsibles
setupCollapsible('toggle-buffs', 'buff-tags');
setupCollapsible('toggle-debuffs', 'debuff-tags');
setupCollapsible('toggle-sort', 'sort-body');

// ─── Detail View ───────────────────────────────────────────────────

const SLOT_LABELS = ['Gauge Skill', 'Skill 2', 'Skill 3', 'Hidden Piece'];

let activeSpineCharId = null;
var glCanvas = null;
var glContext = null;
var sceneRenderer = null;
var currentSkeleton = null;
var currentAnimState = null;
var animFrameId = null;
var lastFrameTime = 0;
var spineResizeObserver = null;
var spineViewport = null;

// SkeletonData cache — much lighter than caching full SpinePlayer instances
var skeletonDataCache = {};     // charId -> { skeletonData, assetManager }
var skeletonCacheOrder = [];    // LRU order, oldest first
var SKELETON_CACHE_MAX = 20;
var loadingPromises = {};       // charId -> Promise<SkeletonData>

function ensureSpineGL() {
  if (glCanvas) return;
  if (typeof spine === 'undefined') throw new Error('Spine runtime not loaded');
  glCanvas = document.createElement('canvas');
  glCanvas.style.width = '100%';
  glCanvas.style.height = '100%';
  glCanvas.style.display = 'block';
  glCanvas.width = 800;
  glCanvas.height = 1200;
  glContext = new spine.ManagedWebGLRenderingContext(glCanvas, { alpha: true, premultipliedAlpha: false, antialias: true });
  sceneRenderer = new spine.SceneRenderer(glCanvas, glContext);
}

// Initialize shared WebGL context at page load (runtime loaded via <script> tag)
if (typeof spine !== 'undefined') {
  try { ensureSpineGL(); } catch(e) { console.warn('Spine GL init deferred:', e); }
}

// Obfuscated bundle format (see scripts/pack-spine.js). Keep key in sync.
var BUNDLE_KEY = new Uint8Array([0x7b, 0x41, 0x9e, 0xd2, 0x3c, 0x67, 0xa5, 0x18]);
var BUNDLE_TYPE = { JSON: 0, ATLAS: 1, WEBP: 2 };

function decodeBundle(arrayBuffer) {
  var bytes = new Uint8Array(arrayBuffer.byteLength);
  var src = new Uint8Array(arrayBuffer);
  for (var i = 0; i < src.length; i++) bytes[i] = src[i] ^ BUNDLE_KEY[i % BUNDLE_KEY.length];
  if (bytes[0] !== 0x46 || bytes[1] !== 0x53 || bytes[2] !== 0x4c || bytes[3] !== 0x31) {
    throw new Error('bundle: bad magic');
  }
  var version = bytes[4];
  if (version !== 1) throw new Error('bundle: unsupported version ' + version);
  var numAssets = bytes[5];
  var pos = 6;
  var dv = new DataView(bytes.buffer);
  var entries = [];
  for (var a = 0; a < numAssets; a++) {
    var type = bytes[pos++];
    var nameLen = bytes[pos++];
    var name = '';
    for (var k = 0; k < nameLen; k++) name += String.fromCharCode(bytes[pos++]);
    var offset = dv.getUint32(pos, true); pos += 4;
    var length = dv.getUint32(pos, true); pos += 4;
    entries.push({ type: type, name: name, offset: offset, length: length });
  }
  var payloadStart = pos;
  return entries.map(function(e) {
    return {
      type: e.type,
      name: e.name,
      data: bytes.subarray(payloadStart + e.offset, payloadStart + e.offset + e.length),
    };
  });
}

function assetVersion() {
  var meta = document.querySelector('meta[name="asset-version"]');
  return meta ? meta.getAttribute('content') : '';
}

function fetchAndDecodeBundle(charId) {
  var v = assetVersion();
  var url = 'spine/' + charId + '/b.bin' + (v ? '?v=' + v : '');
  return fetch(url).then(function(r) {
    if (!r.ok) throw new Error('bundle fetch ' + r.status);
    return r.arrayBuffer();
  }).then(decodeBundle);
}

function loadSkeletonData(charId) {
  if (skeletonDataCache[charId]) return Promise.resolve(skeletonDataCache[charId].skeletonData);
  if (loadingPromises[charId]) return loadingPromises[charId];

  var config = SPINE_DATA[charId];
  if (!config) return Promise.reject(new Error('No spine config'));

  ensureSpineGL();

  // Bypass spine.AssetManager entirely. It routes texture loads through
  // <img>.src, which surfaces the webp data URIs in the Network panel where
  // they can be right-click-saved. Here we decode the bundle, build the atlas
  // manually, and upload each webp to a GLTexture via createImageBitmap —
  // the pixel data never hits an <img> element, so nothing leaks to DevTools.
  loadingPromises[charId] = fetchAndDecodeBundle(charId).then(function(assets) {
    var jsonAsset = assets.find(function(a) { return a.type === BUNDLE_TYPE.JSON; });
    var atlasAsset = assets.find(function(a) { return a.type === BUNDLE_TYPE.ATLAS; });
    var webpAssets = assets.filter(function(a) { return a.type === BUNDLE_TYPE.WEBP; });
    if (!jsonAsset || !atlasAsset) throw new Error('bundle: missing json/atlas');

    var decoder = new TextDecoder('utf-8');
    var atlasText = decoder.decode(atlasAsset.data);
    var jsonText = decoder.decode(jsonAsset.data);
    var atlas = new spine.TextureAtlas(atlasText);

    var webpByName = {};
    for (var i = 0; i < webpAssets.length; i++) webpByName[webpAssets[i].name] = webpAssets[i].data;

    var texturePromises = atlas.pages.map(function(page) {
      var bytes = webpByName[page.name];
      if (!bytes) return Promise.reject(new Error('bundle: missing page ' + page.name));
      var blob = new Blob([bytes], { type: 'image/webp' });
      return createImageBitmap(blob).then(function(bitmap) {
        // Premultiply alpha at upload time. Source textures store straight alpha
        // with RGB=0 in transparent pixels; without PMA, linear filtering at sprite
        // edges blends that black into neighbours, producing a thin dark fringe.
        var gl = glContext.gl;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        var tex = new spine.GLTexture(glContext, bitmap);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        page.setTexture(tex);
        return tex;
      });
    });

    return Promise.all(texturePromises).then(function(textures) {
      var atlasLoader = new spine.AtlasAttachmentLoader(atlas);
      var skelJson = new spine.SkeletonJson(atlasLoader);
      var skeletonData = skelJson.readSkeletonData(JSON.parse(jsonText));

      // Surrogate for the old AssetManager — LRU eviction calls .dispose().
      var disposer = {
        dispose: function() {
          for (var i = 0; i < textures.length; i++) textures[i].dispose();
        }
      };
      skeletonDataCache[charId] = { skeletonData: skeletonData, assetManager: disposer };
      var idx = skeletonCacheOrder.indexOf(charId);
      if (idx !== -1) skeletonCacheOrder.splice(idx, 1);
      skeletonCacheOrder.push(charId);

      while (skeletonCacheOrder.length > SKELETON_CACHE_MAX) {
        var oldest = skeletonCacheOrder[0];
        if (oldest === activeSpineCharId) break;
        skeletonCacheOrder.shift();
        if (skeletonDataCache[oldest]) {
          skeletonDataCache[oldest].assetManager.dispose();
          delete skeletonDataCache[oldest];
        }
      }
      return skeletonData;
    });
  }).then(function(skeletonData) {
    delete loadingPromises[charId];
    return skeletonData;
  }).catch(function(err) {
    delete loadingPromises[charId];
    throw err;
  });

  return loadingPromises[charId];
}

function preloadSpine(charId) {
  if (!SPINE_DATA[charId] || typeof spine === 'undefined') return;
  loadSkeletonData(charId).catch(function() {});
}

function stopSpineRender() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (spineResizeObserver) {
    spineResizeObserver.disconnect();
    spineResizeObserver = null;
  }
  currentSkeleton = null;
  currentAnimState = null;
  spineViewport = null;
}

function updateCanvasSize(container) {
  if (!glCanvas || !container) return;
  var rect = container.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var w = Math.round(rect.width * dpr);
  var h = Math.round(rect.height * dpr);
  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
  }
}

function renderSpineFrame() {
  if (!currentSkeleton || !currentAnimState || !glCanvas) return;

  var now = Date.now() / 1000;
  var delta = Math.min(now - lastFrameTime, 0.1);
  lastFrameTime = now;

  currentSkeleton.update(delta);
  currentAnimState.update(delta);
  currentAnimState.apply(currentSkeleton);
  currentSkeleton.updateWorldTransform(2);

  var cw = glCanvas.width;
  var ch = glCanvas.height;
  if (cw === 0 || ch === 0) { animFrameId = requestAnimationFrame(renderSpineFrame); return; }

  var vp = spineViewport;
  var cam = sceneRenderer.camera;

  // Always fit by height so character size depends only on canvas height, not width. Keeps sizing consistent across portrait/landscape aspects.
  // Smaller multiplier = larger on-screen model. 1.0 fits the tuned viewport exactly with no extra margin.
  cam.viewportWidth = cw;
  cam.viewportHeight = ch;
  cam.zoom = 1.0 * vp.h / ch;
  cam.position.x = vp.x + vp.w / 2;
  cam.position.y = vp.y + vp.h / 2;

  var gl = glContext.gl;
  gl.viewport(0, 0, cw, ch);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  sceneRenderer.begin();
  sceneRenderer.drawSkeleton(currentSkeleton, true);
  sceneRenderer.end();

  animFrameId = requestAnimationFrame(renderSpineFrame);
}

function showSpineModel(c, container) {
  stopSpineRender();
  ensureSpineGL();
  container.appendChild(glCanvas);
  updateCanvasSize(container);

  spineResizeObserver = new ResizeObserver(function() { updateCanvasSize(container); });
  spineResizeObserver.observe(container);

  var charId = c.id;
  var config = SPINE_DATA[charId];
  activeSpineCharId = charId;

  loadSkeletonData(charId).then(function(skeletonData) {
    currentSkeleton = new spine.Skeleton(skeletonData);

    var skinName = config.skin !== undefined ? config.skin : 'armor_1';
    if (skinName && skinName !== 'none') {
      var combined = new spine.Skin('combined');
      combined.addSkin(skeletonData.findSkin('default'));
      combined.addSkin(skeletonData.findSkin(skinName));
      currentSkeleton.setSkin(combined);
      currentSkeleton.setSlotsToSetupPose();
    }

    var stateData = new spine.AnimationStateData(skeletonData);
    currentAnimState = new spine.AnimationState(stateData);
    currentAnimState.setAnimation(0, 'body_idle', true);
    try { currentAnimState.setAnimation(1, 'face_idle_blink', true); } catch(e) {
      try { currentAnimState.setAnimation(1, 'face_idel_blink', true); } catch(e2) {}
    }

    // Use the manually tuned viewport when specified (per-character framing),
    // otherwise fall back to getBounds for auto-fit characters.
    var rawX, rawY, rawW, rawH, hasViewport = !!config.viewport;
    if (hasViewport) {
      rawX = config.viewport.x; rawY = config.viewport.y;
      rawW = config.viewport.width; rawH = config.viewport.height;
    } else {
      currentSkeleton.updateWorldTransform(2);
      var offset = new spine.Vector2();
      var size = new spine.Vector2();
      currentSkeleton.getBounds(offset, size, []);
      rawX = offset.x; rawY = offset.y;
      rawW = size.x; rawH = size.y;
    }

    // 10% padding around tuned viewports; auto-bounds are already slightly padded by Spine
    var padFactor = hasViewport ? 0.1 : 0.0;
    var padH = rawW * padFactor, padV = rawH * padFactor;
    var px = rawX - padH, py = rawY - padV, pw = rawW + padH * 2, ph = rawH + padV * 2;

    // Optional per-character zoom override
    var z = config.zoom || 1;
    if (z !== 1) {
      var cx = px + pw / 2, cy = py + ph / 2;
      pw /= z; ph /= z;
      px = cx - pw / 2; py = cy - ph / 2;
    }
    spineViewport = { x: px, y: py, w: pw, h: ph };

    // Reset physics constraints so tails/hair/etc start from correct pose
    currentSkeleton.updateWorldTransform(1);

    container.classList.remove('spine-loading');
    lastFrameTime = Date.now() / 1000;
    animFrameId = requestAnimationFrame(renderSpineFrame);
  }).catch(function(err) {
    console.warn('Spine load error:', err);
    container.classList.remove('spine-loading');
    showPortraitFallback(container, c);
  });
}

function destroySpinePlayer() {
  stopSpineRender();
}

// Manual description overrides for awkwardly worded game strings.
// Cooldown style normalized to "(Cooldown: {6} turns)" — the dominant convention
// the game uses for the other ~68 cooldown-bearing skills. The bare "<{6} turns>"
// notation is ambiguous (sometimes buff duration, sometimes cooldown), so we
// rewrite confirmed-cooldown skills to the unambiguous paren form.
var DESC_OVERRIDES = {
  41094: 'Increases attack power buff for yourself. (Cooldown: {6} turns)',
  41104: 'Deals {1}% damage to {0} low-HP targets and inflicts Targeting debuff. (Cooldown: {6} turns)',
  41124: 'On the first turn, grants all allies Defense Up and a Shield proportional to her Attack for 3 turns.',
  41224: 'Deals {1}% damage to enemies in front and inflicts Freeze with a {3}% chance. (Cooldown: {6} turns)',
  41234: 'Piercing Attack – Deals {1}% damage to the target and {2}% damage to enemies behind the target, and deals {4}% additional damage to Bleeding targets. (Cooldown: {6} turns)',
  41243: 'Passive — Increases the Defense of all allies.',
  41244: 'On the first turn, grants a Crowd Control Shield and Continuous Recovery to front-line allies <Activates once>',
  41541: 'Deals {1}% damage to {0} random enemies and has a {3}% chance to inflict Target.',
  41542: 'After using Main Skill, has a {6}% chance to deal {1}% damage to {0} random enemies and inflict ATK Debuff. Deals an additional {4}% damage to targets affected by Target.',
  41543: 'On basic attack, grants Shield to {0} random allies.',
  41544: 'Grants Crit Chance and Crit DMG buffs to {0} random allies and restores {1} Skill Gauge. (Cooldown: {6} turns)',
  41554: 'Targets the lowest HP enemy that is affected by Punishment: deals {1}% damage with a guaranteed Critical Hit. (Cooldown: {6} turns)',
  41574: 'Attacks {0} low-HP enemies for {1}% damage, and guarantees a Critical Hit against targets with Bleed. (Cooldown: {6} turns)',
  41584: 'Grants self Attack Up and Evasion Up buffs. (Cooldown: {6} turns)',
  71021: 'Deals {1}% damage to the enemy in front of her. {3}% chance to inflict Burn.',
  71071: 'Deals {1}% damage to {0} random enemies and has a {3}% chance to inflict Unhealable.',
  71104: 'All targets — deals {1}% damage and has a {3}% chance to inflict Burn. (Cooldown: {6} turns)',
  71111: 'Fan-Shaped Area Attack - Deals {1}% damage with a {3}% chance to inflict Burn',
  71113: 'Passive — Increases the Attack of all allies.',
  71114: 'All targets — deals {1}% damage and has a {3}% chance to inflict Burn. (Cooldown: {6} turns)',
  71163: 'Passive — Grants self Attack Up.',
  71164: 'Piercing Attack – Deals {1}% damage to the target and {2}% damage to enemies behind the target, with a {3}% chance to inflict Bleed. (Cooldown: {6} turns)',
  71173: 'Passive — Grants self Evasion Up.',
  71174: 'Attacks {0} low-HP enemies for {1}% damage and deals {4}% additional damage to targets affected by Burn. (Cooldown: {6} turns)',
  71204: 'Targets the enemy with the highest ATK. Deals {1}% damage and inflicts Charm. (Cooldown: {6} turns)',
};

function formatSkillDesc(skill) {
  let desc = DESC_OVERRIDES[skill.id] || strings[skill.descIndex] || '';
  for (let i = 0; i < 5; i++) {
    // Show all three skill levels as "level1/level2/level3", matching the buff/debuff
    // section. Level 1 = valueMins, level 3 = valueMaxs, level 2 = linear midpoint (floored).
    var mn = Math.round(skill.valueMins[i]), mx = Math.round(skill.valueMaxs[i]);
    var mid = Math.floor((mn + mx) / 2);
    var val = (mn !== mx && mx > 0) ? mn + '/' + mid + '/' + mx : mx;
    desc = desc.replace(new RegExp('\\{' + (i + 1) + '\\}', 'g'), val);
  }
  // {6} is context-dependent: "{6}%" = trigger chance (triggerValue), "{6} turn" = buff duration (castValue)
  var buffDuration = (skill.buffIds[0] && buffMap[skill.buffIds[0]]) ? buffMap[skill.buffIds[0]].castValue : skill.triggerValue;
  desc = desc.replace(/\{6\}(%)/g, skill.triggerValue + '$1');
  // Cooldown is triggerValue, not buff duration. Matches both "(Cooldown: {6})" and "<Cooldown: {6}>".
  desc = desc.replace(/([(<]Cooldown\s*:\s*)\{6\}/gi, '$1' + skill.triggerValue);
  desc = desc.replace(/\{6\}/g, buffDuration);
  desc = desc.replace(/\{0\}/g, skill.targetCount);
  // Fix grammar: "1 random enemies" → "1 random enemy", "1 front-line enemies" → "1 front-line enemy", "1 allies" → "1 ally"
  desc = desc.replace(/\b1 ((?:random |front[- ]line |back[- ]line |front[- ]row |back[- ]row )*)enemies\b/g, '1 $1enemy');
  desc = desc.replace(/\b1 ((?:random |front[- ]line |back[- ]line |front[- ]row |back[- ]row )*)allies\b/g, '1 $1ally');
  // Normalize "back enemies" → "back row enemies" for consistent targeting phrasing
  desc = desc.replace(/\bback enemies\b/g, 'back row enemies');
  // Normalize "the user" → "the caster" to match the wording used elsewhere
  desc = desc.replace(/\bthe user\b/g, 'the caster');
  return desc;
}

function formatBuffLine(buff, isPassive) {
  var desc = strings[buff.descIndex] || '';
  if (!desc) return null;
  // {0} = duration, {1}-{5} = value slots 0-4
  // Level 1 = valueMins, level 3 = valueMaxs, level 2 = ceil((min+max)/2)
  var castValue = buff.castValue;
  if (buff.type === 'Charm' && castValue === 0 && /attacking allies \{0\} times/i.test(desc)) {
    castValue = 1;
  }
  desc = desc.replace(/\{0\}/g, castValue);
  for (var i = 0; i < 5; i++) {
    var mn = Math.round(buff.valueMins[i]), mx = Math.round(buff.valueMaxs[i]);
    // Game shows level 1 / level 3 / level 5; mid is linear interp at level 3, truncated.
    var mid = Math.floor((mn + mx) / 2);
    var val = (mn !== mx && mx > 0) ? mn + '/' + mid + '/' + mx : mx;
    desc = desc.replace(new RegExp('\\{' + (i + 1) + '\\}', 'g'), val);
  }
  // Passives are permanent auras (continuously reapplied via the PassiveBuffAndDebuff
  // trigger). A handful borrow generic buffs whose text carries a "for N turns" duration
  // (e.g. Deandra's "Attack Buff"); strip that wording so passives don't read as timed.
  var m = desc.match(/^For\s+(\d+)\s+(turns?)(?:\s*\(s\))?:\s*(.+)$/i);
  if (m) {
    var rest = m[3].trim();
    var hadPeriod = /\.$/.test(rest);
    rest = rest.replace(/\.$/, '');
    // Move the awkward "For N turn(s): <effect>" prefix to "<effect> for N turn(s)" —
    // reads more naturally after the buff name is already shown as a colon-prefix.
    desc = isPassive ? rest + (hadPeriod ? '.' : '')
                     : rest + ' for ' + m[1] + ' ' + m[2] + (hadPeriod ? '.' : '');
  } else if (isPassive) {
    desc = desc.replace(/\s+for\s+\d+\s+turns?(?=\.?\s*$)/i, '');
  }
  return desc;
}

function buildBuffLines(skill) {
  var lines = [];
  var isPassive = skill.type === 'PassiveBuff';
  skill.buffIds.forEach(function(bid) {
    if (!bid || !buffMap[bid]) return;
    var buff = buffMap[bid];
    var name = strings[buff.nameIndex] || '';
    var desc = formatBuffLine(buff, isPassive);
    if (!name && !desc) return;
    lines.push({ name: name, desc: desc });
  });
  return lines;
}

function el(tag, cls, children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (typeof children === 'string') e.textContent = children;
  else if (Array.isArray(children)) children.forEach(ch => { if (ch) e.appendChild(ch); });
  else if (children instanceof Node) e.appendChild(children);
  return e;
}

function buildStatsSection(c) {
  const stats = [
    ['ATK', Math.round(c.baseStats.ATK)],
    ['DEF', Math.round(c.baseStats.DEF)],
    ['HP', Math.round(c.baseStats.HP)],
    ['SPD', Math.round(c.baseStats.SPD)],
    ['Crit Chance', (c.baseStats.CRI / 100).toFixed(1) + '%'],
    ['Crit DMG', (c.baseStats.CRI_DMG / 100).toFixed(1) + '%'],
    ['Evasion', (c.baseStats.DDG / 100).toFixed(1) + '%'],
    ['Accuracy', (c.baseStats.ACC / 100).toFixed(1) + '%'],
  ];
  const grid = el('div', 'detail-stats');
  stats.forEach(([label, val]) => {
    grid.appendChild(el('div', 'stat-cell', [
      el('div', 'stat-label', label),
      el('div', 'stat-value', String(val)),
    ]));
  });
  const frag = document.createDocumentFragment();
  frag.appendChild(el('div', 'detail-section-title', 'Base Stats'));
  frag.appendChild(grid);
  return frag;
}

function colorizeDesc(text) {
  var rules = [
    { re: /\d+%/g, cls: 'sd-val' },
    { re: /\b(all allies|all enemies|all targets|(?:all )?back[- ]?row (?:ally|allies|enemy|enemies)|(?:all )?front[- ]?row (?:ally|allies|enemy|enemies)|front[- ]line (?:ally|allies|enemy|enemies)|back[- ]line (?:ally|allies|enemy|enemies)|enemies in (?:the )?front|enemies in (?:the )?back|main target|additional targets|\d+ (?:random )?(?:allies|ally|enemies|enemy) with the (?:highest|lowest) \w+|\d+ random enem(?:y|ies)|(?:\d+ )?random all(?:y|ies)|random enem(?:y|ies)|the target(?: behind)?|each target|the caster|the enemy in front of \w+|(?:her|his) single front target|a (?:random )?front[- ]?row enemy|the front enemy|herself|himself|self|all team members|(?:enemy|ally|allies|enemies) with the (?:highest|lowest) \w+|lowest[- ]HP (?:ally|enemy)|(?:a )?fallen ally|\d+ random allies|the enemy behind|(?:\d+ )?low[- ]HP enem(?:y|ies))\b/gi, cls: 'sd-target' },
    { re: /\b(Charm|Freeze|Frozen|Burn|Bleed|Stun|Poison|Punishment|Distraction|Unhealable|Resurrection Ban|Buff Remove|Shield Remove|removes? (?:Stat Up )?[Bb]uffs?|Attribute Curse|ATK Debuff|DEF Debuff|SPD Debuff|Accuracy Debuff|Accuracy Decrease|Evasion Debuff|Accuracy Down|Evasion Down|Gauge Reduce|reduces (?:their )?(?:[Ss]kill )?[Gg]auge(?: by \d+)?|reduces (?:[Ss]kill )?[Gg]auge of|removes? (?:de)?buffs?|(?:inflict |affected by )Target)\b/gi, cls: 'sd-debuff' },
    { re: /\b(Crowd Control Shield|ATK Buff|DEF Buff|SPD Buff|HP Buff|CRIT Rate Buff|CRIT DMG Buff|Accuracy Buff|Evasion Buff|Attack Up|Defense Up|Defence Up|Evasion Up|Speed Up|Accuracy Up|Shield|Heal Over Time|Resurrect|Cleanse|Gauge Recovery|Skill Gauge Gain Up|Skill Recovery Enhancement|Increased Attack|Umbarrier|attack buff|defense buff|Stat Up buff|Increases? (?:her |his )?(?:the )?(?:Attack|Defense|Defence|Speed|Evasion|Accuracy|HP)|[Rr]estor(?:es?|ing) HP|restore(?:s|d)? \d+ Skill Gauge|Continuous Recovery|Revives?|Crit (?:Chance|DMG) (?:and Crit (?:Chance|DMG) )?buffs?|Critical Hit (?:Chance|Damage) Up|restores? \d+ Skill Gauge)\b/gi, cls: 'sd-buff' },
    { re: /\(Cooldown:\s*\d+\s*turns?\)/gi, cls: 'sd-cd' },
    { re: /\b\d+\s*turns?\b/gi, cls: 'sd-cd' },
    { re: /\bWhen defeated:?/gi, cls: 'sd-cd' },
    { re: /\bActivates? once\.?/gi, cls: 'sd-cd' },
    { re: /\bOn the first turn,?/gi, cls: 'sd-cd' },
    { re: /\b(Guaranteed crit(?:ical)?|guarantees? a Critical Hit|(?:landing|with) a Critical Hit|Ignor(?:es?|ing) (?:the target'?s? )?[Dd]efen[sc]e|Penetrat(?:ion|ing) [Aa]ttack|Piercing [Aa]ttack|Fan [Aa]ttack|Basic Attacks?|[Mm]ain [Ss]kill|[Ee]vading|[Cc]ounterattacks?)\b/gi, cls: 'sd-keyword' },
  ];
  var matches = [];
  rules.forEach(function(rule) {
    var m;
    while ((m = rule.re.exec(text)) !== null) {
      matches.push({ s: m.index, e: m.index + m[0].length, t: m[0], c: rule.cls });
    }
  });
  matches.sort(function(a, b) { return a.s - b.s || b.e - a.e; });
  var filtered = [], lastEnd = 0;
  matches.forEach(function(m) {
    if (m.s >= lastEnd) { filtered.push(m); lastEnd = m.e; }
  });
  var frag = document.createDocumentFragment();
  var pos = 0;
  filtered.forEach(function(m) {
    if (m.s > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.s)));
    var span = document.createElement('span');
    span.className = m.c;
    span.textContent = m.t;
    frag.appendChild(span);
    pos = m.e;
  });
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  return frag;
}

function buildSkillsSection(c) {
  const container = el('div', 'detail-skills');
  c.skillIds.forEach(sid => {
    const skill = skillMap[sid];
    if (!skill) return;
    const slotLabel = SLOT_LABELS[skill.slotIndex] || 'Skill';
    const name = strings[skill.nameIndex] || 'Skill #' + sid;
    const desc = formatSkillDesc(skill);
    const slotClass = skill.isHiddenPiece ? 'skill-slot hidden-piece' : 'skill-slot';

    var descEl = el('div', 'skill-desc');
    descEl.appendChild(colorizeDesc(desc));

    var buffLines = buildBuffLines(skill);
    var buffListEl = buffLines.length ? el('div', 'skill-buff-list') : null;
    if (buffListEl) {
      buffLines.forEach(function(line) {
        var lineEl = el('div', 'skill-buff-line');
        var nameSpan = el('span', 'skill-buff-name', line.name + ':');
        lineEl.appendChild(nameSpan);
        lineEl.appendChild(document.createTextNode(' '));
        lineEl.appendChild(colorizeDesc(line.desc));
        buffListEl.appendChild(lineEl);
      });
    }

    container.appendChild(el('div', 'skill-card', [
      el('div', 'skill-top', [
        el('span', slotClass, slotLabel),
        el('span', 'skill-name', name),
      ]),
      descEl,
      buffListEl,
    ]));
  });
  const frag = document.createDocumentFragment();
  frag.appendChild(el('div', 'detail-section-title', 'Skills'));
  frag.appendChild(container);
  return frag;
}

function openDetail(c) {
  const overlay = document.getElementById('detail-overlay');
  const content = document.getElementById('detail-content');
  content.replaceChildren();

  const name = getName(c);
  const rarityText = RARITY_MAP[c.boneStar] || '?';
  const rarityClass = RARITY_CLASS[c.boneStar] || '';
  const elId = ELEMENT_ID[c.element] || 1;

  // Header
  const elIcon = document.createElement('img');
  elIcon.className = 'detail-element-icon';
  elIcon.src = '../data/icons/element_' + elId + '.png';
  elIcon.alt = c.element;

  const raritySpan = el('span', 'detail-rarity rarity-label ' + rarityClass, rarityText);
  const metaSpan = el('span', 'detail-meta', [raritySpan]);
  metaSpan.appendChild(document.createTextNode(' ' + c.class));

  content.appendChild(el('div', 'detail-header', [
    elIcon,
    el('span', 'detail-name', name),
    metaSpan,
  ]));

  // Body
  const spineCol = el('div', 'detail-spine-col');
  spineCol.id = 'spine-col';

  // Wrap the spine column so the banner badge can sit alongside it (outside
  // the spine-loading opacity transition that would otherwise hide it).
  const portraitWrap = el('div', 'detail-portrait-wrap', [spineCol]);
  if (c.bannerType) {
    // 'event' shares one label but each event character keeps a distinct color,
    // applied via a per-character modifier class (banner-badge--event-<id>).
    var badgeClass = 'banner-badge banner-badge--' + c.bannerType;
    if (c.bannerType === 'event') badgeClass += ' banner-badge--event-' + c.id;
    portraitWrap.appendChild(
      el('span', badgeClass, BANNER_TYPE_LABELS[c.bannerType] || c.bannerType)
    );
  }

  const infoCol = el('div', 'detail-info-col');
  infoCol.appendChild(buildStatsSection(c));
  infoCol.appendChild(buildSkillsSection(c));

  content.appendChild(el('div', 'detail-body', [portraitWrap, infoCol]));

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Spine model or portrait fallback
  if (SPINE_DATA[c.id]) {
    if (!skeletonDataCache[c.id]) spineCol.classList.add('spine-loading');
    try {
      showSpineModel(c, spineCol);
    } catch (err) {
      console.warn('Spine render error:', err);
      spineCol.classList.remove('spine-loading');
      showPortraitFallback(spineCol, c);
    }
  } else {
    showPortraitFallback(spineCol, c);
  }
}

function showPortraitFallback(container, c) {
  container.replaceChildren();
  const img = document.createElement('img');
  img.className = 'detail-portrait-fallback';
  img.src = '../data/portraits/char_tex_' + c.id + '.png';
  img.alt = getName(c);
  container.appendChild(img);
}

function closeDetail() {
  stopSpineRender();
  if (glCanvas && glCanvas.parentNode) glCanvas.remove();
  activeSpineCharId = null;
  document.getElementById('detail-overlay').classList.add('hidden');
  document.getElementById('detail-content').replaceChildren();
  document.body.style.overflow = '';
}

// Close handlers
document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDetail();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('detail-overlay').classList.contains('hidden')) {
    closeDetail();
  }
});

// ─── Spine Tuning Tool ─────────────────────────────────────────────

var tuneState = null; // { charId, panX, panY, zoom, bbox }

function getStoredTune(charId) {
  try {
    var all = JSON.parse(localStorage.getItem('spineTune') || '{}');
    return all[charId] || null;
  } catch(e) { return null; }
}

function storeTune(charId, panX, panY, zoom) {
  try {
    var all = JSON.parse(localStorage.getItem('spineTune') || '{}');
    all[charId] = { panX: Math.round(panX), panY: Math.round(panY), zoom: Math.round(zoom * 100) / 100 };
    localStorage.setItem('spineTune', JSON.stringify(all));
  } catch(e) {}
}

function tuneToViewport(charId, tune, bbox) {
  var z = tune.zoom || 1;
  var w = bbox.width / z;
  var h = bbox.height / z;
  var cx = bbox.x + bbox.width / 2 - tune.panX;
  var cy = bbox.y + bbox.height / 2 + tune.panY; // Y inverted in Spine
  return { x: Math.round(cx - w/2), y: Math.round(cy - h/2), width: Math.round(w), height: Math.round(h) };
}

function getCharBBox(charId) {
  // Return skeleton bounding box (read from JSON during player creation)
  var config = SPINE_DATA[charId];
  if (config && config._bbox) return config._bbox;
  return null;
}

function setupTuneControls(spineCol, charId) {
  var toolbar = document.createElement('div');
  toolbar.className = 'tune-toolbar';

  var label = document.createElement('span');
  label.className = 'tune-label';
  label.textContent = 'Zoom:';

  var slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'tune-slider';
  slider.min = '50';
  slider.max = '300';
  slider.value = String((tuneState.zoom || 1) * 100);

  var valLabel = document.createElement('span');
  valLabel.className = 'tune-val';
  valLabel.textContent = slider.value + '%';

  var applyBtn = document.createElement('button');
  applyBtn.className = 'tune-btn';
  applyBtn.textContent = 'Apply';

  var exportBtn = document.createElement('button');
  exportBtn.className = 'tune-btn';
  exportBtn.textContent = 'Export All';

  toolbar.appendChild(label);
  toolbar.appendChild(slider);
  toolbar.appendChild(valLabel);
  toolbar.appendChild(applyBtn);
  toolbar.appendChild(exportBtn);

  // Wrap spine col + toolbar in a container so they don't break the flex layout
  var wrapper = document.createElement('div');
  wrapper.className = 'detail-spine-wrapper';
  spineCol.parentNode.insertBefore(wrapper, spineCol);
  wrapper.appendChild(spineCol);
  wrapper.appendChild(toolbar);

  // Update CSS transform for live preview
  function updatePreview() {
    var canvas = spineCol.querySelector('canvas');
    if (canvas) {
      var z = tuneState.zoom;
      var px = tuneState.panX / tuneState.bbox.width * 100 * z;
      var py = tuneState.panY / tuneState.bbox.height * 100 * z;
      canvas.style.transform = 'translate(' + px + '%, ' + py + '%) scale(' + z + ')';
    }
  }

  slider.addEventListener('input', function() {
    tuneState.zoom = parseInt(slider.value) / 100;
    valLabel.textContent = slider.value + '%';
    updatePreview();
  });

  // Drag to pan
  var dragging = false, startX, startY, startPanX, startPanY;
  spineCol.addEventListener('mousedown', function(e) {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = tuneState.panX;
    startPanY = tuneState.panY;
    spineCol.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    // Convert pixel drag to skeleton units
    var rect = spineCol.getBoundingClientRect();
    var pxPerUnit = rect.width / tuneState.bbox.width;
    tuneState.panX = startPanX + (e.clientX - startX) / pxPerUnit;
    tuneState.panY = startPanY - (e.clientY - startY) / pxPerUnit;
    updatePreview();
  });
  document.addEventListener('mouseup', function() {
    if (dragging) {
      dragging = false;
      spineCol.style.cursor = 'grab';
    }
  });
  spineCol.style.cursor = 'grab';

  // Apply: save to localStorage and reload spine player with computed viewport
  applyBtn.addEventListener('click', function() {
    storeTune(charId, tuneState.panX, tuneState.panY, tuneState.zoom);
    // Remove CSS transform and reload with actual viewport
    var canvas = spineCol.querySelector('canvas');
    if (canvas) canvas.style.transform = '';
    destroySpinePlayer();
    var container = document.createElement('div');
    container.id = 'spine-container';
    container.style.width = '100%';
    container.style.height = '100%';
    spineCol.replaceChildren(container);
    var vp = tuneToViewport(charId, tuneState, tuneState.bbox);
    createTunedSpinePlayer(charId, vp);
  });

  // Export: dump all stored viewports as JS
  exportBtn.addEventListener('click', function() {
    var all = JSON.parse(localStorage.getItem('spineTune') || '{}');
    var lines = [];
    for (var cid in all) {
      var tune = all[cid];
      // Need bbox for this char
      var config = SPINE_DATA[cid];
      if (!config) continue;
      // We'll compute viewport from stored tune + skeleton bbox
      lines.push('  // ' + cid + ': pan=(' + tune.panX + ',' + tune.panY + ') zoom=' + tune.zoom);
    }
    // For full export, read all skeletons - just output the raw tune data
    console.log('=== Spine Tune Data (localStorage) ===');
    console.log(JSON.stringify(all, null, 2));
    console.log('=== Copy the above and use tuneToViewport() to compute viewports ===');
    alert('Tune data exported to browser console (F12). ' + Object.keys(all).length + ' characters adjusted.');
  });
}

function createTunedSpinePlayer(charId, viewport) {
  var spineConfig = SPINE_DATA[charId];
  var playerConfig = {
    jsonUrl: spineConfig.jsonUrl,
    atlasUrl: spineConfig.atlasUrl,
    animation: 'body_idle',
    premultipliedAlpha: true,
    showControls: false,
    alpha: true,
    backgroundColor: '#00000000',
    viewport: viewport,
    success: function(player) {
      var skinName = spineConfig.skin !== undefined ? spineConfig.skin : 'armor_1';
      if (skinName && skinName !== 'none') {
        var skeleton = player.skeleton;
        var data = skeleton.data;
        var combined = new spine.Skin('combined');
        combined.addSkin(data.findSkin('default'));
        combined.addSkin(data.findSkin(skinName));
        skeleton.setSkin(combined);
        skeleton.setSlotsToSetupPose();
      }
      try { player.animationState.setAnimation(1, 'face_idle_blink', true); } catch(e) {
        try { player.animationState.setAnimation(1, 'face_idel_blink', true); } catch(e2) {}
      }
    },
    error: function() {}
  };
  new spine.SpinePlayer('spine-container', playerConfig);
}

// ─── Init ───────────────────────────────────────────────────────────

loadData();
