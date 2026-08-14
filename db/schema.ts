import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameRooms = sqliteTable("game_rooms", {
  code: text("code").primaryKey(),
  hostPeerId: text("host_peer_id").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const roomPlayers = sqliteTable(
  "room_players",
  {
    peerId: text("peer_id").primaryKey(),
    roomCode: text("room_code").notNull(),
    name: text("name").notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [index("idx_room_players_room_code").on(table.roomCode)],
);

export const roomSignals = sqliteTable(
  "room_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomCode: text("room_code").notNull(),
    targetPeerId: text("target_peer_id").notNull(),
    senderPeerId: text("sender_peer_id").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_room_signals_target_after").on(
      table.roomCode,
      table.targetPeerId,
      table.id,
    ),
  ],
);
