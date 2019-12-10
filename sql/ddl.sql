CREATE TABLE user (
  id bigint(20) NOT NULL AUTO_INCREMENT,
  userId varchar(255) NOT NULL,
  userName varchar(96) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY USERID_INDEX (userId) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;


CREATE TABLE `imageGroup` (
             `id` bigint(20) NOT NULL AUTO_INCREMENT,
             `title` varchar(64) DEFAULT NULL,
             `description` varchar(1024) DEFAULT NULL,
             `path` varchar(128) NOT NULL,
             `sourcePath` varchar(128) NOT NULL,
             `createdBy` bigint(20) DEFAULT NULL,
             `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
             `deactivationTime` timestamp NULL DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `imageCreatedBy` (`createdBy`),
              CONSTRAINT `image_ibfk_1` FOREIGN KEY (`createdBy`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4;


CREATE TABLE `imageGroupTag` (
              `id` bigint(20) NOT NULL AUTO_INCREMENT,
              `tag` varchar(128) DEFAULT NULL,
              `createdBy` bigint(20) DEFAULT NULL,
              `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
              `deactivationTime` timestamp NULL DEFAULT NULL,
              PRIMARY KEY (`id`),
              KEY `imageGroupTagCreatedBy` (`createdBy`),
              CONSTRAINT `imageGroupTag_ibfk_1` FOREIGN KEY (`createdBy`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4;


CREATE TABLE `imageTag` (
            `id` bigint(20) NOT NULL AUTO_INCREMENT,
            `tag` varchar(128) DEFAULT NULL,
            `documentId` varchar(64) NOT NULL,
            `createdBy` bigint(20) DEFAULT NULL,
            `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            `deactivationTime` timestamp NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `imageView` (
            `id` bigint(20) NOT NULL AUTO_INCREMENT,
            `documentId` varchar(64) NOT NULL,
            `createdBy` bigint(20) DEFAULT NULL,
            `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            `deactivationTime` timestamp NULL DEFAULT NULL,
            PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `userAssociation` (
           `id` bigint(20) NOT NULL AUTO_INCREMENT,
           `userId` bigint(20) NOT NULL,
           `friendUserId` bigint(20) NOT NULL,
           `createdBy` bigint(20) DEFAULT NULL,
           `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
           `deactivationTime` timestamp NULL DEFAULT NULL,
           PRIMARY KEY (`id`),
           KEY `userId` (`userId`),
           KEY `friendUserId` (`friendUserId`),
           KEY `createdBy` (`createdBy`),
           CONSTRAINT `userassociation_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `user` (`id`),
           CONSTRAINT `userassociation_ibfk_2` FOREIGN KEY (`friendUserId`) REFERENCES `user` (`id`),
           CONSTRAINT `userassociation_ibfk_3` FOREIGN KEY (`createdBy`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4;

CREATE TABLE `imageComment` (
            `id` bigint(20) NOT NULL AUTO_INCREMENT,
            `documentId` varchar(64) NOT NULL,
            `comment` text DEFAULT NULL,
            `createdBy` bigint(20) DEFAULT NULL,
            `createdTime` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            `deactivationTime` timestamp NULL DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `imageCommentCreatedBy` (`createdBy`),
            CONSTRAINT `imageComment_ibfk_1` FOREIGN KEY (`createdBy`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=123 DEFAULT CHARSET=utf8mb4;
