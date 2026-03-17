import Database from 'better-sqlite3'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const dbPath = process.env.DATABASE_PATH ?? './heartbeat.db'
const db = new Database(path.resolve(dbPath))

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
`)

// Add user_id column to devices if missing (safe migration)
try {
  db.exec(`ALTER TABLE devices ADD COLUMN user_id TEXT REFERENCES users(id)`)
} catch {
  // column already exists
}

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
    UPDATE user_energy SET boxes_opened = boxes_opened + 1 WHERE user_id = @user_id
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
}

export default db
