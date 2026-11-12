import type { Bucket } from '@goal-tracker/shared/types'
import { commitOrConflict, param, requireBucket } from '../context.ts'
import type { RouteHandler } from '../context.ts'
import { conflict } from '../errors.ts'
import { applyChanges, sortOldestFirst } from '../patch.ts'
import { bucketKey, putOperation } from '../repository.ts'
import { formatTimestamp } from '../time.ts'
import { parseCreateBucket, parseUpdateBucket } from '../validation.ts'
import { findLeftover } from './leftover.ts'

export const listBuckets: RouteHandler = async (ctx) => {
  const buckets = await ctx.deps.repo.listBuckets(ctx.userId)
  return { status: 200, body: sortOldestFirst(buckets, (bucket) => bucket.bucket_id) }
}

export const createBucket: RouteHandler = async (ctx) => {
  const request = parseCreateBucket(ctx.body)
  const timestamp = formatTimestamp(ctx.now)
  const bucket: Bucket = {
    ...request,
    bucket_id: ctx.deps.newId(),
    user_id: ctx.userId,
    status: 'available',
    created_at: timestamp,
    updated_at: timestamp,
  }
  await ctx.deps.repo.putBucket(bucket)
  return { status: 201, body: bucket }
}

export const updateBucket: RouteHandler = async (ctx) => {
  const changes = parseUpdateBucket(ctx.body)
  const bucket = await requireBucket(ctx, param(ctx, 'bucket_id'))
  const updated = applyChanges(bucket, { ...changes, updated_at: formatTimestamp(ctx.now) })
  // The condition keeps a concurrent status change (claim, release, retire) from being overwritten.
  await commitOrConflict(
    ctx,
    [putOperation(bucketKey(ctx.userId, bucket.bucket_id), updated, { type: 'status_is', status: bucket.status })],
    () => conflict('bucket_not_available', 'This bucket changed while you were editing it. Try again.'),
  )
  return { status: 200, body: updated }
}

export const retireBucket: RouteHandler = async (ctx) => {
  const bucket = await requireBucket(ctx, param(ctx, 'bucket_id'))
  if (bucket.status !== 'available') {
    throw conflict('bucket_not_available', 'Only an available bucket can be retired.')
  }
  const retired: Bucket = { ...bucket, status: 'retired', updated_at: formatTimestamp(ctx.now) }
  await commitOrConflict(
    ctx,
    [putOperation(bucketKey(ctx.userId, bucket.bucket_id), retired, { type: 'status_is', status: 'available' })],
    () => conflict('bucket_not_available', 'Only an available bucket can be retired.'),
  )
  return { status: 200, body: retired }
}

export const getBucketLeftover: RouteHandler = async (ctx) => {
  const bucket = await requireBucket(ctx, param(ctx, 'bucket_id'))
  const leftover = await findLeftover(ctx, bucket.bucket_id)
  return { status: 200, body: leftover.summary }
}
