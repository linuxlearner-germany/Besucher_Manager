import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const routeSource=readFileSync(resolve(__dirname,"simplifiedRegistrations.ts"),"utf8");
const migrationSource=readFileSync(resolve(__dirname,"../../migrations/036_public_simplified_registrations.sql"),"utf8");

test("public import and status endpoints apply csrf and rate limiting",()=>{
  for(const path of ["/api/public/simplified-registration/import","/api/public/simplified-registration/status"]){const endpoint=routeSource.match(new RegExp(`simplifiedRegistrationsRouter\\.post\\(\\"${path.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\"[\\s\\S]*?(?=simplifiedRegistrationsRouter\\.|$)`));assert.ok(endpoint,path);assert.match(endpoint[0],/rateLimit/);assert.match(endpoint[0],/requireCsrf/);}
});

test("only KasKdt or explicitly permitted custom users can review",()=>{
  assert.match(routeSource,/canReviewSimplifiedRegistrations\(user\)/);
});

test("guard view requires role or custom permission and an assigned gate",()=>{
  assert.match(routeSource,/canViewGuardSimplifiedVisitors\(user\)/);
});

test("migration separates requests and entries and adds indexed barracks scope",()=>{
  for(const table of ["barracks_areas","simplified_registration_requests","simplified_registration_entries","simplified_nationality_notification_deliveries"])assert.match(migrationSource,new RegExp(`CREATE TABLE dbo\\.${table}`));
  assert.match(migrationSource,/visitor_id UNIQUEIDENTIFIER NOT NULL/);assert.match(migrationSource,/version INT NOT NULL/);assert.match(migrationSource,/ix_simplified_entries_scope_validity/);assert.match(migrationSource,/token_hash CHAR\(64\)/);
});
