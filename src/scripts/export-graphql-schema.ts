import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { AppModule } from '../app.module';

async function exportSchema() {
  process.env.FLOWFRET_SCHEMA_EXPORT = 'true';
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    await app.init();
    const { schema } = app.get(GraphQLSchemaHost);
    const outputPath = path.resolve(process.argv[2] ?? 'schema.graphql');
    await writeFile(outputPath, `${printSchema(schema)}\n`, 'utf8');
    console.log(`GraphQL schema written to ${outputPath}`);
  } finally {
    await app.close();
  }
}

void exportSchema().catch((error: unknown) => {
  console.error('Failed to export the GraphQL schema.', error);
  process.exitCode = 1;
});
