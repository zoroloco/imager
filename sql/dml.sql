-- 11-16-19
alter table image
add column `title` varchar(64) DEFAULT NULL after `groupId`;
commit;
alter table image
add column `description` varchar(1024) DEFAULT NULL after `title`;
commit;
alter table image
add column `thumbPath` varchar(128) DEFAULT NULL after `path`;
commit;
alter table image
add column `orientation` varchar(16) DEFAULT NULL after `resolution`;
commit;
alter table image
add column `cameraModel` varchar(64) DEFAULT NULL after `mimeType`;
commit;
