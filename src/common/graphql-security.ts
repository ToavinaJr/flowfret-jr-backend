import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql';

export interface GraphqlSecurityLimits {
  maxDepth: number;
  maxFields: number;
  maxAliases: number;
  maxComplexity: number;
}

type Metrics = {
  fields: number;
  aliases: number;
  depth: number;
  complexity: number;
};

const RELATION_FIELDS = new Set([
  'author',
  'profile',
  'post',
  'track',
  'upload',
  'user',
]);
const COLLECTION_FIELDS = new Set([
  'attachments',
  'auditLogs',
  'authoredPosts',
  'comments',
  'commentsByPost',
  'friendshipsReceived',
  'friendshipsRequested',
  'likes',
  'mentionedUsers',
  'myFriendships',
  'myNotifications',
  'myPlaylists',
  'notifications',
  'playlistItems',
  'postAttachments',
  'postLikes',
  'postReports',
  'posts',
  'profiles',
  'reports',
  'uploads',
  'users',
]);
const EXPENSIVE_FIELDS = new Set(['searchMusic', 'searchUsers']);

export function createGraphqlSecurityRule(
  limits: GraphqlSecurityLimits,
): ValidationRule {
  return (context) => ({
    Document(node: DocumentNode) {
      const fragments = new Map<string, FragmentDefinitionNode>();
      for (const definition of node.definitions) {
        if (definition.kind === Kind.FRAGMENT_DEFINITION) {
          fragments.set(definition.name.value, definition);
        }
      }

      for (const definition of node.definitions) {
        if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
        const metrics: Metrics = {
          fields: 0,
          aliases: 0,
          depth: 0,
          complexity: 0,
        };
        inspectOperation(definition, fragments, metrics);
        if (metrics.depth > limits.maxDepth) {
          context.reportError(
            new GraphQLError(
              `GraphQL query depth ${metrics.depth} exceeds the limit of ${limits.maxDepth}.`,
              { nodes: definition },
            ),
          );
        }
        if (metrics.fields > limits.maxFields) {
          context.reportError(
            new GraphQLError(
              `GraphQL field count ${metrics.fields} exceeds the limit of ${limits.maxFields}.`,
              { nodes: definition },
            ),
          );
        }
        if (metrics.aliases > limits.maxAliases) {
          context.reportError(
            new GraphQLError(
              `GraphQL alias count ${metrics.aliases} exceeds the limit of ${limits.maxAliases}.`,
              { nodes: definition },
            ),
          );
        }
        if (metrics.complexity > limits.maxComplexity) {
          context.reportError(
            new GraphQLError(
              `GraphQL query complexity ${metrics.complexity} exceeds the limit of ${limits.maxComplexity}.`,
              { nodes: definition },
            ),
          );
        }
      }
      return false;
    },
  });
}

function inspectOperation(
  operation: OperationDefinitionNode,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  metrics: Metrics,
): void {
  inspectSelectionSet(operation.selectionSet, 1, fragments, metrics, new Set());
}

function inspectSelectionSet(
  selectionSet: SelectionSetNode,
  depth: number,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  metrics: Metrics,
  fragmentStack: ReadonlySet<string>,
): void {
  metrics.depth = Math.max(metrics.depth, depth);
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      metrics.fields += 1;
      metrics.complexity += fieldCost(selection.name.value);
      if (selection.alias) metrics.aliases += 1;
      if (selection.selectionSet) {
        inspectSelectionSet(
          selection.selectionSet,
          depth + 1,
          fragments,
          metrics,
          fragmentStack,
        );
      }
      continue;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      inspectSelectionSet(
        selection.selectionSet,
        depth,
        fragments,
        metrics,
        fragmentStack,
      );
      continue;
    }
    const name = selection.name.value;
    const fragment = fragments.get(name);
    if (!fragment || fragmentStack.has(name)) continue;
    const nextStack = new Set(fragmentStack);
    nextStack.add(name);
    inspectSelectionSet(
      fragment.selectionSet,
      depth,
      fragments,
      metrics,
      nextStack,
    );
  }
}

function fieldCost(name: string): number {
  if (EXPENSIVE_FIELDS.has(name)) return 20;
  if (COLLECTION_FIELDS.has(name)) return 10;
  if (RELATION_FIELDS.has(name)) return 2;
  return 1;
}
