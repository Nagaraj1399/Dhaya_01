import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Users table required for Firebase Auth synchronization
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// BBMP / Greater Bengaluru Authority Wards table
export const wards = pgTable('wards', {
  wardId: integer('ward_id').primaryKey(),
  wardName: text('ward_name').notNull(),
  zone: text('zone').notNull(),
  geometry: jsonb('geometry').notNull(), // GeoJSON Polygon coordinates
  officerContact: text('officer_contact').notNull(),
  officerName: text('officer_name').notNull(),
  officerPhone: text('officer_phone').notNull(),
  officerEmail: text('officer_email').notNull(),
});

// Road Hazards table
export const hazards = pgTable('hazards', {
  id: serial('id').primaryKey(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  wardId: integer('ward_id')
    .references(() => wards.wardId)
    .notNull(),
  category: text('category').notNull(), // 'pothole' | 'waterlogging' | 'damaged_footpath' | 'other'
  severity: text('severity').notNull(), // 'minor' | 'major' | 'hazardous'
  aiSuggestedCategory: text('ai_suggested_category'),
  aiSuggestedSeverity: text('ai_suggested_severity'),
  humanOverridden: boolean('human_overridden').default(false).notNull(),
  status: text('status').default('open').notNull(), // 'open' | 'resolved' | 'disputed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  photoUrl: text('photo_url').notNull(),
  photoHash: text('photo_hash').notNull(),
  description: text('description').notNull(),
  confirmationCount: integer('confirmation_count').default(1).notNull(),
  deviceId: text('device_id').notNull(),
  isSeed: boolean('is_seed').default(false).notNull(),
});

// Corroborating Confirmations table
export const confirmations = pgTable('confirmations', {
  id: serial('id').primaryKey(),
  hazardId: integer('hazard_id')
    .references(() => hazards.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  photoUrl: text('photo_url'),
  photoHash: text('photo_hash'),
  note: text('note'),
  deviceId: text('device_id').notNull(),
});

// Generated Evidence Packets table
export const evidencePackets = pgTable('evidence_packets', {
  id: serial('id').primaryKey(),
  hazardId: integer('hazard_id')
    .references(() => hazards.id)
    .notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  fileUrl: text('file_url').notNull(),
  packetHash: text('packet_hash').notNull(),
  packetJson: jsonb('packet_json').notNull(),
});

// Relations
export const wardsRelations = relations(wards, ({ many }) => ({
  hazards: many(hazards),
}));

export const hazardsRelations = relations(hazards, ({ one, many }) => ({
  ward: one(wards, {
    fields: [hazards.wardId],
    references: [wards.wardId],
  }),
  confirmations: many(confirmations),
  evidencePackets: many(evidencePackets),
}));

export const confirmationsRelations = relations(confirmations, ({ one }) => ({
  hazard: one(hazards, {
    fields: [confirmations.hazardId],
    references: [hazards.id],
  }),
}));

export const evidencePacketsRelations = relations(evidencePackets, ({ one }) => ({
  hazard: one(hazards, {
    fields: [evidencePackets.hazardId],
    references: [hazards.id],
  }),
}));
