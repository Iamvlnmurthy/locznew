-- A protected-media case is not ordinary content moderation. Keep the role distinct
-- so routine moderators and platform administrators cannot inherit evidence access.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'CHILD_SAFETY_OFFICER';
