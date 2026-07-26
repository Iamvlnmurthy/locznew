-- Restricted metadata can be sensitive even when no image is shown. Record each detail
-- view so case access can be reconstructed without relying on application logs.
ALTER TYPE "MediaSafetyAccessAction" ADD VALUE IF NOT EXISTS 'CASE_VIEWED';
