import { RecoveryError } from './errors'
import { bytesToHex, hexToBytes } from './hex'

/**
 * Narrow codec so unit tests can fake TreeNode bytes without a network.
 * Production capture should pass `TreeNode` from
 * `@buildonspark/spark-sdk/proto/spark` (the subpath exists in 0.11.0).
 *
 * This package's devDependency may resolve a newer spark-sdk than the web
 * app's 0.11.0 pin. Inject the codec from the app's install when the bytes
 * must match that pin. `loadSparkTreeNodeCodec` imports whatever copy Node
 * resolves for this package, and it does not open a connection.
 */
export interface TreeNodeCodec<T> {
  encode(message: T): { finish(): Uint8Array }
  decode(input: Uint8Array): T
}

export function encodeTreeNodeHex<T>(node: T, codec: TreeNodeCodec<T>): string {
  return bytesToHex(codec.encode(node).finish())
}

export function decodeTreeNodeHex<T>(hex: string, codec: TreeNodeCodec<T>): T {
  return codec.decode(hexToBytes(hex, 'treeNodeHex'))
}

interface SparkProtoModule {
  TreeNode?: TreeNodeCodec<unknown>
}

export async function loadSparkTreeNodeCodec(): Promise<TreeNodeCodec<unknown>> {
  let proto: SparkProtoModule
  try {
    proto = (await import('@buildonspark/spark-sdk/proto/spark')) as SparkProtoModule
  } catch {
    throw new RecoveryError(
      'RECOVERY_CODEC_UNAVAILABLE',
      'TreeNode encode/decode was not importable from @buildonspark/spark-sdk/proto/spark.',
    )
  }
  const codec = proto.TreeNode
  if (!codec || typeof codec.encode !== 'function' || typeof codec.decode !== 'function') {
    throw new RecoveryError(
      'RECOVERY_CODEC_UNAVAILABLE',
      'TreeNode encode/decode was not importable from @buildonspark/spark-sdk/proto/spark.',
    )
  }
  return codec
}
