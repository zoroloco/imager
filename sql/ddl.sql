CREATE TABLE user (
  id bigint(20) NOT NULL AUTO_INCREMENT,
  userId varchar(255) NOT NULL,
  userName varchar(96) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY USERID_INDEX (userId) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;

create table image
(
  id               bigint auto_increment
    primary key,
  groupId          bigint                                null,
  title            varchar(64)                           null,
  description      varchar(1024)                         null,
  format           varchar(32)                           null,
  mimeType         varchar(32)                           null,
  resolution       varchar(16)                           null,
  width            int                                   null,
  height           int                                   null,
  orientation      varchar(16)                           null,
  cameraModel      varchar(64)                           null,
  path             varchar(128)                          not null,
  thumbPath        varchar(128)                          null,
  sourcePath       varchar(128)                          not null,
  createdBy        bigint                                null,
  createdTime      timestamp default current_timestamp() null on update current_timestamp(),
  deactivationTime timestamp null,
  constraint image_ibfk_1
    foreign key (createdBy) references user (id)
);

create index imageCreatedBy
  on image (createdBy);

create table image_tag
(
  id             bigint auto_increment
    primary key,
  name           varchar(64) not null,
  imageId       bigint      null,
  createdBy bigint(20) DEFAULT NULL,
  createdTime timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  deactivationTime timestamp NULL DEFAULT current_timestamp(),
  constraint image_tag_ibfk_1
    foreign key (createdBy) references user (id),
  constraint image_tag_ibfk_2
    foreign key (imageId) references image (id)
);

create index imageTagCreatedBy
  on image_tag (createdBy);

create index imageTagImageId
  on image_tag (imageId);

