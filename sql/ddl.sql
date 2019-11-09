CREATE TABLE `user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `userId` varchar(255) NOT NULL,
  `userName` varchar(96) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `USERID_INDEX` (`userId`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `image` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `groupId` bigint(20) DEFAULT NULL,
  `privacyFlag` tinyint(4) DEFAULT 0,
  `path` varchar(128) NOT NULL,
  `sourcePath` varchar(128) NOT NULL,
  `createdBy` bigint(20) DEFAULT NULL,
  `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `modifiedBy` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `createdBy` (`createdBy`),
  KEY `modifiedBy` (`modifiedBy`),
  CONSTRAINT `image_ibfk_1` FOREIGN KEY (`createdBy`) REFERENCES `user` (`id`),
  CONSTRAINT `image_ibfk_2` FOREIGN KEY (`modifiedBy`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=224 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `image_tag` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `image_id` bigint(20) DEFAULT NULL,
  `image_group_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4;
