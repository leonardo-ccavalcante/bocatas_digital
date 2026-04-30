CREATE TABLE `entregas` (
	`id` varchar(36) NOT NULL,
	`entregas_batch_id` varchar(36) NOT NULL,
	`familia_id` varchar(36) NOT NULL,
	`fecha` varchar(10) NOT NULL,
	`persona_recibio` varchar(255),
	`frutas_hortalizas_cantidad` int,
	`frutas_hortalizas_unidad` varchar(50),
	`carne_cantidad` int,
	`carne_unidad` varchar(50),
	`notas` text,
	`ocr_row_confidence` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entregas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entregas_batch` (
	`id` varchar(36) NOT NULL,
	`numero_albaran` varchar(100) NOT NULL,
	`numero_reparto` varchar(100) NOT NULL,
	`numero_factura_carne` varchar(100),
	`total_personas_asistidas` int NOT NULL,
	`fecha_reparto` varchar(10) NOT NULL,
	`documento_imagen_url` text,
	`ocr_confidence` int,
	`estado_batch` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entregas_batch_id` PRIMARY KEY(`id`),
	CONSTRAINT `entregas_batch_numero_albaran_unique` UNIQUE(`numero_albaran`)
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` varchar(36) NOT NULL,
	`familia_numero` varchar(100) NOT NULL,
	`nombre_responsable` varchar(255) NOT NULL,
	`email` varchar(320),
	`telefono` varchar(20),
	`estado` enum('activa','inactiva','suspendida') NOT NULL DEFAULT 'activa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `families_id` PRIMARY KEY(`id`),
	CONSTRAINT `families_familia_numero_unique` UNIQUE(`familia_numero`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','superadmin','voluntario','beneficiario') NOT NULL DEFAULT 'user';