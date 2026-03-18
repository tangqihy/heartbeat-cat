import Database from 'better-sqlite3'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const dbPath = process.env.DATABASE_PATH ?? './heartbeat.db'
const db = new Database(dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id        TEXT    PRIMARY KEY,
    name      TEXT    NOT NULL,
    type      TEXT    NOT NULL DEFAULT 'unknown',
    last_seen INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id        TEXT    NOT NULL,
    app_name         TEXT    NOT NULL,
    app_title        TEXT,
    start_time       INTEGER NOT NULL,
    end_time         INTEGER NOT NULL,
    duration         INTEGER NOT NULL,
    keyboard_events  INTEGER NOT NULL DEFAULT 0,
    mouse_events     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS heartbeat_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id     TEXT    NOT NULL,
    timestamp     INTEGER NOT NULL,
    app_name      TEXT    NOT NULL,
    activity_type TEXT,
    description   TEXT,
    details       TEXT,
    apps_visible  TEXT,
    is_idle       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_device_time
    ON sessions(device_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_sessions_start_time
    ON sessions(start_time);
  CREATE INDEX IF NOT EXISTS idx_snapshots_device_time
    ON heartbeat_snapshots(device_id, timestamp);

  -- ── Bongo Cat gamification tables ──

  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    friend_code  TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    cat_color    TEXT DEFAULT '#f5f5f5',
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS item_catalog (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    category TEXT NOT NULL,
    rarity   TEXT NOT NULL,
    svg_ref  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_items (
    user_id     TEXT    NOT NULL,
    item_id     TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    obtained_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS user_equipped (
    user_id TEXT NOT NULL,
    slot    TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, slot)
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id   TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    added_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS user_energy (
    user_id      TEXT PRIMARY KEY,
    energy       INTEGER NOT NULL DEFAULT 0,
    boxes_opened INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_input_stats (
    user_id         TEXT    NOT NULL,
    date            TEXT    NOT NULL,
    keyboard_count  INTEGER NOT NULL DEFAULT 0,
    mouse_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  -- ── Achievement system ──

  CREATE TABLE IF NOT EXISTS achievement_catalog (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT NOT NULL,
    category    TEXT NOT NULL,
    condition   TEXT NOT NULL,
    reward_energy INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id        TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  );

  -- ── Friend interactions ──

  CREATE TABLE IF NOT EXISTS interactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user  TEXT NOT NULL,
    to_user    TEXT NOT NULL,
    type       TEXT NOT NULL,
    item_id    TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_interaction_limits (
    user_id    TEXT NOT NULL,
    date       TEXT NOT NULL,
    fish_count INTEGER NOT NULL DEFAULT 0,
    pet_count  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  -- ── RPG: Level & Skill system ──

  CREATE TABLE IF NOT EXISTS user_level (
    user_id          TEXT    PRIMARY KEY,
    level            INTEGER NOT NULL DEFAULT 1,
    experience       INTEGER NOT NULL DEFAULT 0,
    total_experience INTEGER NOT NULL DEFAULT 0,
    skill_points     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_skills (
    user_id  TEXT    NOT NULL,
    skill_id TEXT    NOT NULL,
    level    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, skill_id)
  );

  -- ── RPG: Quest system ──

  CREATE TABLE IF NOT EXISTS quest_templates (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    type          TEXT NOT NULL,
    condition     TEXT NOT NULL,
    reward_type   TEXT NOT NULL,
    reward_amount INTEGER NOT NULL,
    icon          TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_quests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT    NOT NULL,
    quest_id       TEXT    NOT NULL,
    date           TEXT    NOT NULL,
    target         INTEGER NOT NULL,
    completed      INTEGER NOT NULL DEFAULT 0,
    reward_claimed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_user_quests_user_date
    ON user_quests(user_id, date);

  CREATE TABLE IF NOT EXISTS user_tokens (
    user_id TEXT    PRIMARY KEY,
    tokens  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quest_shop (
    id      TEXT    PRIMARY KEY,
    item_id TEXT    NOT NULL,
    cost    INTEGER NOT NULL,
    stock   INTEGER NOT NULL DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS daily_activity (
    user_id           TEXT    NOT NULL,
    date              TEXT    NOT NULL,
    boxes_opened      INTEGER NOT NULL DEFAULT 0,
    crafts_done       INTEGER NOT NULL DEFAULT 0,
    interactions_done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );
`)

// Add user_id column to devices if missing (safe migration)
try {
  db.exec(`ALTER TABLE devices ADD COLUMN user_id TEXT REFERENCES users(id)`)
} catch {
  // column already exists
}

// Add last_box_opened_at column for 30-min cooldown
try {
  db.exec(`ALTER TABLE user_energy ADD COLUMN last_box_opened_at INTEGER NOT NULL DEFAULT 0`)
} catch {
  // column already exists
}

// Add allowance columns for accumulated box opens
try {
  db.exec(`ALTER TABLE user_energy ADD COLUMN open_allowance INTEGER NOT NULL DEFAULT 0`)
} catch {}
try {
  db.exec(`ALTER TABLE user_energy ADD COLUMN last_allowance_ts INTEGER NOT NULL DEFAULT 0`)
} catch {}

export const stmts = {
  upsertDevice: db.prepare(`
    INSERT INTO devices (id, name, type, last_seen)
    VALUES (@id, @name, @type, @last_seen)
    ON CONFLICT(id) DO UPDATE SET
      name      = excluded.name,
      type      = excluded.type,
      last_seen = excluded.last_seen
  `),

  insertSession: db.prepare(`
    INSERT INTO sessions
      (device_id, app_name, app_title, start_time, end_time, duration, keyboard_events, mouse_events)
    VALUES
      (@device_id, @app_name, @app_title, @start_time, @end_time, @duration, @keyboard_events, @mouse_events)
  `),

  insertSnapshot: db.prepare(`
    INSERT INTO heartbeat_snapshots
      (device_id, timestamp, app_name, activity_type, description, details, apps_visible, is_idle)
    VALUES
      (@device_id, @timestamp, @app_name, @activity_type, @description, @details, @apps_visible, @is_idle)
  `),

  getDevices: db.prepare(`
    SELECT * FROM devices ORDER BY last_seen DESC
  `),

  getUsageByDevice: db.prepare(`
    SELECT app_name, SUM(duration) as total_duration,
           SUM(keyboard_events) as total_keyboard, SUM(mouse_events) as total_mouse
    FROM sessions
    WHERE device_id = @device_id AND start_time >= @start AND start_time < @end
    GROUP BY app_name
    ORDER BY total_duration DESC
  `),

  getUsageAll: db.prepare(`
    SELECT app_name, SUM(duration) as total_duration,
           SUM(keyboard_events) as total_keyboard, SUM(mouse_events) as total_mouse
    FROM sessions
    WHERE start_time >= @start AND start_time < @end
    GROUP BY app_name
    ORDER BY total_duration DESC
  `),

  getTimelineByDevice: db.prepare(`
    SELECT device_id, app_name, app_title, start_time, end_time, duration,
           keyboard_events, mouse_events
    FROM sessions
    WHERE device_id = @device_id AND start_time >= @start AND start_time < @end
    ORDER BY start_time ASC
  `),

  getTimelineAll: db.prepare(`
    SELECT device_id, app_name, app_title, start_time, end_time, duration,
           keyboard_events, mouse_events
    FROM sessions
    WHERE start_time >= @start AND start_time < @end
    ORDER BY device_id, start_time ASC
  `),

  getWeeklyByDevice: db.prepare(`
    SELECT
      CAST((start_time - @week_start) / 86400 AS INTEGER) AS day_index,
      app_name,
      SUM(duration)         AS total_duration,
      SUM(keyboard_events)  AS total_keyboard,
      SUM(mouse_events)     AS total_mouse
    FROM sessions
    WHERE device_id = @device_id
      AND start_time >= @week_start AND start_time < @week_end
    GROUP BY day_index, app_name
    ORDER BY day_index, total_duration DESC
  `),

  getWeeklyAll: db.prepare(`
    SELECT
      CAST((start_time - @week_start) / 86400 AS INTEGER) AS day_index,
      app_name,
      SUM(duration)         AS total_duration,
      SUM(keyboard_events)  AS total_keyboard,
      SUM(mouse_events)     AS total_mouse
    FROM sessions
    WHERE start_time >= @week_start AND start_time < @week_end
    GROUP BY day_index, app_name
    ORDER BY day_index, total_duration DESC
  `),

  // Diary / log queries
  getSnapshotsByDevice: db.prepare(`
    SELECT * FROM heartbeat_snapshots
    WHERE device_id = @device_id AND timestamp >= @start AND timestamp < @end
    ORDER BY timestamp ASC
  `),

  getSnapshotsAll: db.prepare(`
    SELECT * FROM heartbeat_snapshots
    WHERE timestamp >= @start AND timestamp < @end
    ORDER BY timestamp ASC
  `),

  // ── Bongo Cat gamification ──

  insertUser: db.prepare(`
    INSERT INTO users (id, friend_code, display_name, cat_color, created_at)
    VALUES (@id, @friend_code, @display_name, @cat_color, @created_at)
  `),

  getUserById: db.prepare(`SELECT * FROM users WHERE id = @id`),

  getUserByFriendCode: db.prepare(`SELECT * FROM users WHERE friend_code = @friend_code`),

  bindDeviceToUser: db.prepare(`UPDATE devices SET user_id = @user_id WHERE id = @device_id`),

  getUserIdByDevice: db.prepare(`SELECT user_id FROM devices WHERE id = @device_id`),

  // Energy
  upsertEnergy: db.prepare(`
    INSERT INTO user_energy (user_id, energy, boxes_opened)
    VALUES (@user_id, @energy, 0)
    ON CONFLICT(user_id) DO UPDATE SET energy = user_energy.energy + @energy
  `),

  getEnergy: db.prepare(`SELECT * FROM user_energy WHERE user_id = @user_id`),

  setEnergy: db.prepare(`UPDATE user_energy SET energy = @energy WHERE user_id = @user_id`),

  incrementBoxesOpened: db.prepare(`
    UPDATE user_energy
    SET boxes_opened = boxes_opened + 1,
        last_box_opened_at = @now,
        open_allowance = MAX(open_allowance - 1, 0)
    WHERE user_id = @user_id
  `),

  updateAllowance: db.prepare(`
    UPDATE user_energy
    SET open_allowance = @open_allowance, last_allowance_ts = @last_allowance_ts
    WHERE user_id = @user_id
  `),

  // Item catalog
  upsertCatalogItem: db.prepare(`
    INSERT INTO item_catalog (id, name, category, rarity, svg_ref)
    VALUES (@id, @name, @category, @rarity, @svg_ref)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, category = excluded.category,
      rarity = excluded.rarity, svg_ref = excluded.svg_ref
  `),

  getCatalog: db.prepare(`SELECT * FROM item_catalog ORDER BY rarity, category, name`),

  getCatalogByRarity: db.prepare(`SELECT * FROM item_catalog WHERE rarity = @rarity`),

  getCatalogItem: db.prepare(`SELECT * FROM item_catalog WHERE id = @id`),

  // User items (inventory)
  upsertUserItem: db.prepare(`
    INSERT INTO user_items (user_id, item_id, quantity, obtained_at)
    VALUES (@user_id, @item_id, 1, @obtained_at)
    ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = user_items.quantity + 1
  `),

  getUserItems: db.prepare(`
    SELECT ui.item_id, ui.quantity, ui.obtained_at,
           ic.name, ic.category, ic.rarity, ic.svg_ref
    FROM user_items ui JOIN item_catalog ic ON ui.item_id = ic.id
    WHERE ui.user_id = @user_id
    ORDER BY ic.rarity, ic.category
  `),

  getUserItem: db.prepare(`
    SELECT * FROM user_items WHERE user_id = @user_id AND item_id = @item_id
  `),

  decrementUserItem: db.prepare(`
    UPDATE user_items SET quantity = quantity - @amount
    WHERE user_id = @user_id AND item_id = @item_id
  `),

  deleteUserItem: db.prepare(`
    DELETE FROM user_items WHERE user_id = @user_id AND item_id = @item_id AND quantity <= 0
  `),

  // Equipped
  equipItem: db.prepare(`
    INSERT INTO user_equipped (user_id, slot, item_id)
    VALUES (@user_id, @slot, @item_id)
    ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id
  `),

  unequipSlot: db.prepare(`DELETE FROM user_equipped WHERE user_id = @user_id AND slot = @slot`),

  getEquipped: db.prepare(`
    SELECT ue.slot, ue.item_id, ic.name, ic.category, ic.rarity, ic.svg_ref
    FROM user_equipped ue JOIN item_catalog ic ON ue.item_id = ic.id
    WHERE ue.user_id = @user_id
  `),

  // ── Friends ──

  addFriend: db.prepare(`
    INSERT OR IGNORE INTO friends (user_id, friend_id, added_at)
    VALUES (@user_id, @friend_id, @added_at)
  `),

  removeFriend: db.prepare(`
    DELETE FROM friends WHERE user_id = @user_id AND friend_id = @friend_id
  `),

  getFriends: db.prepare(`
    SELECT f.friend_id, f.added_at,
           u.display_name, u.friend_code, u.cat_color, u.created_at
    FROM friends f JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = @user_id
    ORDER BY f.added_at DESC
  `),

  isFriend: db.prepare(`
    SELECT 1 FROM friends WHERE user_id = @user_id AND friend_id = @friend_id
  `),

  getLastSeenByUser: db.prepare(`
    SELECT MAX(d.last_seen) as last_seen
    FROM devices d WHERE d.user_id = @user_id
  `),

  // ── Daily input stats ──

  upsertDailyInput: db.prepare(`
    INSERT INTO daily_input_stats (user_id, date, keyboard_count, mouse_count)
    VALUES (@user_id, @date, @keyboard, @mouse)
    ON CONFLICT(user_id, date) DO UPDATE SET
      keyboard_count = daily_input_stats.keyboard_count + @keyboard,
      mouse_count    = daily_input_stats.mouse_count    + @mouse
  `),

  getDailyInput: db.prepare(`
    SELECT keyboard_count, mouse_count FROM daily_input_stats
    WHERE user_id = @user_id AND date = @date
  `),

  getDailyInputRange: db.prepare(`
    SELECT date, keyboard_count, mouse_count FROM daily_input_stats
    WHERE user_id = @user_id AND date >= @start_date AND date <= @end_date
    ORDER BY date ASC
  `),

  getAllDailyInputForUser: db.prepare(`
    SELECT date, keyboard_count, mouse_count FROM daily_input_stats
    WHERE user_id = @user_id ORDER BY date ASC
  `),

  // ── Achievements ──

  upsertAchievement: db.prepare(`
    INSERT INTO achievement_catalog (id, name, description, icon, category, condition, reward_energy)
    VALUES (@id, @name, @description, @icon, @category, @condition, @reward_energy)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      icon = excluded.icon, category = excluded.category,
      condition = excluded.condition, reward_energy = excluded.reward_energy
  `),

  getAchievementCatalog: db.prepare(`SELECT * FROM achievement_catalog ORDER BY category, id`),

  getUserAchievements: db.prepare(`
    SELECT ua.achievement_id, ua.unlocked_at, ac.name, ac.description, ac.icon, ac.category, ac.reward_energy
    FROM user_achievements ua JOIN achievement_catalog ac ON ua.achievement_id = ac.id
    WHERE ua.user_id = @user_id ORDER BY ua.unlocked_at DESC
  `),

  hasAchievement: db.prepare(`
    SELECT 1 FROM user_achievements WHERE user_id = @user_id AND achievement_id = @achievement_id
  `),

  unlockAchievement: db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
    VALUES (@user_id, @achievement_id, @unlocked_at)
  `),

  countUserAchievements: db.prepare(`
    SELECT COUNT(*) as count FROM user_achievements WHERE user_id = @user_id
  `),

  // Aggregation helpers for achievement checks
  countUserItems: db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total FROM user_items WHERE user_id = @user_id
  `),

  countDistinctUserItems: db.prepare(`
    SELECT COUNT(DISTINCT item_id) as total FROM user_items WHERE user_id = @user_id
  `),

  countFriends: db.prepare(`
    SELECT COUNT(*) as total FROM friends WHERE user_id = @user_id
  `),

  countUserItemsByCategory: db.prepare(`
    SELECT COUNT(DISTINCT ui.item_id) as owned, (SELECT COUNT(*) FROM item_catalog WHERE category = @category) as total
    FROM user_items ui JOIN item_catalog ic ON ui.item_id = ic.id
    WHERE ui.user_id = @user_id AND ic.category = @category
  `),

  getTotalDailyInput: db.prepare(`
    SELECT COALESCE(SUM(keyboard_count), 0) as total_keyboard,
           COALESCE(SUM(mouse_count), 0) as total_mouse
    FROM daily_input_stats WHERE user_id = @user_id
  `),

  countActiveDays: db.prepare(`
    SELECT COUNT(DISTINCT date) as total FROM daily_input_stats
    WHERE user_id = @user_id AND (keyboard_count > 0 OR mouse_count > 0)
  `),

  getConsecutiveDays: db.prepare(`
    SELECT date FROM daily_input_stats
    WHERE user_id = @user_id AND (keyboard_count > 0 OR mouse_count > 0)
    ORDER BY date DESC LIMIT 60
  `),

  // ── Interactions ──

  insertInteraction: db.prepare(`
    INSERT INTO interactions (from_user, to_user, type, item_id, created_at)
    VALUES (@from_user, @to_user, @type, @item_id, @created_at)
  `),

  getDailyInteractionLimits: db.prepare(`
    SELECT fish_count, pet_count FROM daily_interaction_limits
    WHERE user_id = @user_id AND date = @date
  `),

  upsertDailyInteraction: db.prepare(`
    INSERT INTO daily_interaction_limits (user_id, date, fish_count, pet_count)
    VALUES (@user_id, @date, @fish_inc, @pet_inc)
    ON CONFLICT(user_id, date) DO UPDATE SET
      fish_count = daily_interaction_limits.fish_count + @fish_inc,
      pet_count  = daily_interaction_limits.pet_count  + @pet_inc
  `),

  countInteractionsSent: db.prepare(`
    SELECT COUNT(*) as total FROM interactions WHERE from_user = @user_id AND type = @type
  `),

  // ── Leaderboard ──

  getLeaderboardDaily: db.prepare(`
    SELECT dis.user_id, u.display_name, u.cat_color,
           dis.keyboard_count, dis.mouse_count
    FROM daily_input_stats dis
    JOIN users u ON dis.user_id = u.id
    WHERE dis.date = @date AND dis.user_id IN (
      SELECT friend_id FROM friends WHERE user_id = @user_id
      UNION SELECT @user_id
    )
    ORDER BY (dis.keyboard_count + dis.mouse_count) DESC
  `),

  getLeaderboardWeekly: db.prepare(`
    SELECT dis.user_id, u.display_name, u.cat_color,
           SUM(dis.keyboard_count) as keyboard_count,
           SUM(dis.mouse_count) as mouse_count
    FROM daily_input_stats dis
    JOIN users u ON dis.user_id = u.id
    WHERE dis.date >= @start_date AND dis.date <= @end_date
      AND dis.user_id IN (
        SELECT friend_id FROM friends WHERE user_id = @user_id
        UNION SELECT @user_id
      )
    GROUP BY dis.user_id
    ORDER BY (SUM(dis.keyboard_count) + SUM(dis.mouse_count)) DESC
  `),

  // ── RPG: Level ──

  initLevel: db.prepare(`
    INSERT OR IGNORE INTO user_level (user_id, level, experience, total_experience, skill_points)
    VALUES (@user_id, 1, 0, 0, 0)
  `),

  getUserLevel: db.prepare(`SELECT * FROM user_level WHERE user_id = @user_id`),

  updateLevel: db.prepare(`
    UPDATE user_level
    SET level = @level, experience = @experience,
        total_experience = @total_experience, skill_points = @skill_points
    WHERE user_id = @user_id
  `),

  // ── RPG: Skills ──

  getUserSkills: db.prepare(`SELECT * FROM user_skills WHERE user_id = @user_id`),

  getSkillLevel: db.prepare(`
    SELECT level FROM user_skills WHERE user_id = @user_id AND skill_id = @skill_id
  `),

  upsertSkill: db.prepare(`
    INSERT INTO user_skills (user_id, skill_id, level) VALUES (@user_id, @skill_id, @level)
    ON CONFLICT(user_id, skill_id) DO UPDATE SET level = @level
  `),

  // ── RPG: Quest templates ──

  upsertQuestTemplate: db.prepare(`
    INSERT INTO quest_templates (id, name, description, type, condition, reward_type, reward_amount, icon)
    VALUES (@id, @name, @description, @type, @condition, @reward_type, @reward_amount, @icon)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      type = excluded.type, condition = excluded.condition,
      reward_type = excluded.reward_type, reward_amount = excluded.reward_amount,
      icon = excluded.icon
  `),

  getQuestTemplatesByType: db.prepare(`
    SELECT * FROM quest_templates WHERE type = @type
  `),

  getQuestTemplateById: db.prepare(`
    SELECT * FROM quest_templates WHERE id = @id
  `),

  // ── RPG: User quests ──

  getUserQuestsByDate: db.prepare(`
    SELECT uq.*, qt.name, qt.description, qt.type, qt.condition,
           qt.reward_type, qt.reward_amount, qt.icon
    FROM user_quests uq
    JOIN quest_templates qt ON uq.quest_id = qt.id
    WHERE uq.user_id = @user_id AND uq.date = @date
    ORDER BY uq.id ASC
  `),

  getUserQuestsByDateRange: db.prepare(`
    SELECT uq.*, qt.name, qt.description, qt.type, qt.condition,
           qt.reward_type, qt.reward_amount, qt.icon
    FROM user_quests uq
    JOIN quest_templates qt ON uq.quest_id = qt.id
    WHERE uq.user_id = @user_id AND uq.date >= @start_date AND uq.date <= @end_date
    ORDER BY uq.id ASC
  `),

  getUserQuestById: db.prepare(`
    SELECT uq.*, qt.name, qt.description, qt.type, qt.condition,
           qt.reward_type, qt.reward_amount, qt.icon
    FROM user_quests uq
    JOIN quest_templates qt ON uq.quest_id = qt.id
    WHERE uq.id = @id AND uq.user_id = @user_id
  `),

  insertUserQuest: db.prepare(`
    INSERT INTO user_quests (user_id, quest_id, date, target, completed, reward_claimed)
    VALUES (@user_id, @quest_id, @date, @target, 0, 0)
  `),

  markQuestCompleted: db.prepare(`
    UPDATE user_quests SET completed = 1 WHERE id = @id
  `),

  markQuestClaimed: db.prepare(`
    UPDATE user_quests SET reward_claimed = 1 WHERE id = @id
  `),

  // ── RPG: User tokens ──

  getUserTokens: db.prepare(`
    SELECT tokens FROM user_tokens WHERE user_id = @user_id
  `),

  upsertTokens: db.prepare(`
    INSERT INTO user_tokens (user_id, tokens) VALUES (@user_id, @amount)
    ON CONFLICT(user_id) DO UPDATE SET tokens = user_tokens.tokens + @amount
  `),

  setTokens: db.prepare(`
    UPDATE user_tokens SET tokens = @tokens WHERE user_id = @user_id
  `),

  // ── RPG: Quest shop ──

  upsertQuestShopItem: db.prepare(`
    INSERT INTO quest_shop (id, item_id, cost, stock)
    VALUES (@id, @item_id, @cost, @stock)
    ON CONFLICT(id) DO UPDATE SET
      item_id = excluded.item_id, cost = excluded.cost, stock = excluded.stock
  `),

  getQuestShop: db.prepare(`
    SELECT qs.*, ic.name, ic.category, ic.rarity, ic.svg_ref
    FROM quest_shop qs
    JOIN item_catalog ic ON qs.item_id = ic.id
    ORDER BY qs.cost ASC
  `),

  getQuestShopItem: db.prepare(`
    SELECT qs.*, ic.name, ic.category, ic.rarity, ic.svg_ref
    FROM quest_shop qs
    JOIN item_catalog ic ON qs.item_id = ic.id
    WHERE qs.id = @id
  `),

  // ── RPG: Daily activity tracking ──

  upsertDailyActivity: db.prepare(`
    INSERT INTO daily_activity (user_id, date, boxes_opened, crafts_done, interactions_done)
    VALUES (@user_id, @date, @boxes_inc, @crafts_inc, @interactions_inc)
    ON CONFLICT(user_id, date) DO UPDATE SET
      boxes_opened      = daily_activity.boxes_opened      + @boxes_inc,
      crafts_done       = daily_activity.crafts_done       + @crafts_inc,
      interactions_done = daily_activity.interactions_done  + @interactions_inc
  `),

  getDailyActivity: db.prepare(`
    SELECT * FROM daily_activity WHERE user_id = @user_id AND date = @date
  `),
}

export default db
