import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TeachingMaterialModel {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field(() => String, { nullable: true }) lessonId!: string | null;
  @Field() title!: string;
  @Field() fileName!: string;
  @Field() fileType!: string;
  @Field() fileSize!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
