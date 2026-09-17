import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceGalleryMotion } from './image-viewer-motion';
import { combineGalleryVelocity, galleryMomentumRetention, galleryReleaseVelocity, planGalleryRelease, sampleGalleryVelocity, type GalleryVelocitySample } from './image-viewer-release';

test('any fractional drag is retained exactly when released without momentum', () => {
  for (const direction of [-1, 1]) {
    for (const fraction of [0.0001, 0.005, 0.04, 0.6]) {
      const position = 10 + fraction * direction;
      const plan = planGalleryRelease(position, 0, 200);
      assert.deepEqual(plan, { position, target: position, velocity: 0, phase: 'idle' });
      assert.deepEqual(advanceGalleryMotion(plan, 1, 200), plan);
    }
  }
});

test('even tiny releases coast in the last movement direction without a snap threshold', () => {
  for (const speed of [-0.01, 0.01, -0.2, 0.2]) {
    let plan = planGalleryRelease(10.001, speed, 200);
    assert.equal(plan.phase, 'coast');
    for (let i = 0; i < 240; i++) plan = advanceGalleryMotion(plan, 1 / 60, 200);
    assert.equal(plan.phase, 'idle');
    assert.equal(Math.sign(plan.position - 10.001), Math.sign(speed));
    assert.ok(Math.abs(plan.position - (10.001 + speed / 3)) < 0.001);
    assert.notEqual(plan.position, Math.round(plan.position));
  }
});

test('multi-card flings keep momentum, press braking can still interrupt them, edges stay bounded', () => {
  const plan = planGalleryRelease(11.25, 8, 200);
  assert.equal(plan.phase, 'coast');
  let brake = { ...plan, phase: 'brake' as const } as typeof plan;
  let coast = plan;
  for (let i = 0; i < 240; i++) {
    brake = advanceGalleryMotion(brake, 1 / 60, 200);
    coast = advanceGalleryMotion(coast, 1 / 60, 200);
  }
  assert.ok(brake.position > plan.position && brake.position < coast.position);
  assert.equal(advanceGalleryMotion(planGalleryRelease(0, -8, 200), 1 / 60, 200).position, 0);
  assert.equal(advanceGalleryMotion(planGalleryRelease(199, 8, 200), 1 / 60, 200).position, 199);
  assert.equal(advanceGalleryMotion(planGalleryRelease(0, 8, 1), 1 / 60, 1).position, 0);
  assert.equal(planGalleryRelease(10.25, 0, 200).position, 10.25); // wheel is free too
});

test('release velocity survives a brief pause or duplicate event, then fades when held still', () => {
  const samples: GalleryVelocitySample[] = [{ position: 10, time: 0 }];
  for (let i = 1; i <= 5; i++) sampleGalleryVelocity(samples, { position: 10 + i * 0.25, time: i * 16 });
  const speed = galleryReleaseVelocity(samples, 80);
  sampleGalleryVelocity(samples, { position: 11.25, time: 200 });
  assert.equal(galleryReleaseVelocity(samples, 200), speed); // 120ms pause
  assert.ok(galleryReleaseVelocity(samples, 300) > 0);
  assert.ok(galleryReleaseVelocity(samples, 300) < speed);
  assert.equal(galleryReleaseVelocity(samples, 400), 0);
  assert.equal(galleryReleaseVelocity([], 400), 0);
});

test('velocity window is bounded and adapts to a change of direction', () => {
  const samples: GalleryVelocitySample[] = [];
  for (let i = 0; i <= 1000; i++) sampleGalleryVelocity(samples, { position: i * 0.01, time: i });
  assert.ok(samples.length <= 32);
  assert.ok(galleryReleaseVelocity(samples, 1000) > 0);
  for (let i = 1; i <= 200; i++) sampleGalleryVelocity(samples, { position: 10 - i * 0.01, time: 1000 + i });
  assert.ok(galleryReleaseVelocity(samples, 1200) < 0);
});

test('repeated same-direction swipes add momentum; opposing swipes brake, with a bounded maximum', () => {
  for (const direction of [-1, 1]) {
    const first = direction * 2;
    const second = combineGalleryVelocity(first, first, 100, 0);
    const third = combineGalleryVelocity(first, second, 100, 0);
    assert.ok(Math.abs(second) > Math.abs(first));
    assert.ok(Math.abs(third) > Math.abs(second));
    const reverse = combineGalleryVelocity(-first, third, 100, 0);
    assert.ok(Math.abs(reverse) < Math.abs(third));
    assert.equal(combineGalleryVelocity(0, third, 400, 300), 0);
    assert.equal(galleryMomentumRetention(400), 0); // long press before drag
    assert.equal(Math.abs(planGalleryRelease(10, combineGalleryVelocity(direction * 100, third, 10, 0), 200).velocity), 8);
  }
});

test('holding before a swipe does not dilute its speed, including sparse pointer events', () => {
  const immediate: GalleryVelocitySample[] = [{ position: 10, time: 800 }];
  const held: GalleryVelocitySample[] = [{ position: 10, time: 0 }];
  for (let i = 1; i <= 5; i++) {
    const sample = { position: 10 + i * 0.01, time: 800 + i * 16 };
    sampleGalleryVelocity(immediate, sample); sampleGalleryVelocity(held, sample);
  }
  assert.ok(Math.abs(galleryReleaseVelocity(immediate, 880) - galleryReleaseVelocity(held, 880)) < 0.0001);
  const sparse = [{ position: 10, time: 0 }];
  sampleGalleryVelocity(sparse, { position: 10.01, time: 2000 });
  assert.ok(galleryReleaseVelocity(sparse, 2000) >= 0.099);
  sampleGalleryVelocity(held, { position: 10.04, time: 896 });
  assert.ok(galleryReleaseVelocity(held, 896) < 0); // last impulse, not old direction
});

test('mouse release ignores a one-pixel recoil without delaying a tiny initial swipe', () => {
  for (const direction of [-1, 1]) {
    // Screen-space noise tolerance works for both a thumbnail and a wide image.
    for (const pitch of [96, 600, 1400]) {
      const samples: GalleryVelocitySample[] = [{ position: 10, time: 0, mouseX: 500 }];
      for (let i = 1; i <= 8; i++) sampleGalleryVelocity(samples, {
        position: 10 + direction * i * 20 / pitch, time: i * 16, mouseX: 500 - direction * i * 20,
      });
      const velocity = galleryReleaseVelocity(samples, 128);
      for (const recoil of [1, 2, 1, 2]) sampleGalleryVelocity(samples, {
        position: 10 + direction * (160 - recoil) / pitch, time: 136, mouseX: 500 - direction * (160 - recoil),
      });
      assert.equal(galleryReleaseVelocity(samples, 136), velocity);
      const tiny: GalleryVelocitySample[] = [{ position: 10, time: 0, mouseX: 500 }];
      sampleGalleryVelocity(tiny, { position: 10 + direction / pitch, time: 16, mouseX: 500 - direction });
      assert.equal(Math.sign(galleryReleaseVelocity(tiny, 16)), direction);
    }
  }
});

test('mouse reversal is cumulative from the last extreme; an intentional reverse and a held stop still work', () => {
  const samples: GalleryVelocitySample[] = [{ position: 10, time: 0, mouseX: 500 }];
  sampleGalleryVelocity(samples, { position: 11, time: 80, mouseX: 400 });
  for (let i = 1; i <= 2; i++) sampleGalleryVelocity(samples, { position: 11 - i / 100, time: 80 + i * 8, mouseX: 400 + i });
  assert.ok(galleryReleaseVelocity(samples, 96) > 0);
  sampleGalleryVelocity(samples, { position: 10.97, time: 104, mouseX: 403 });
  assert.ok(galleryReleaseVelocity(samples, 104) < 0);
  assert.equal(Math.abs(galleryReleaseVelocity(samples, 404)), 0);
  // After a deliberate hold, even one pixel in the other direction is fresh.
  sampleGalleryVelocity(samples, { position: 10.98, time: 420, mouseX: 402 });
  assert.ok(galleryReleaseVelocity(samples, 420) > 0);
});

test('twenty repeated mouse impulses retain forward momentum despite release jitter', () => {
  let carry = 0;
  for (let repeat = 0; repeat < 20; repeat++) {
    const samples: GalleryVelocitySample[] = [{ position: 10, time: 0, mouseX: 500 }];
    for (let i = 1; i <= 8; i++) sampleGalleryVelocity(samples, { position: 10 + i / 30, time: i * 16, mouseX: 500 - i * 20 });
    sampleGalleryVelocity(samples, { position: 10 + 159 / 600, time: 136, mouseX: 341 });
    const next = combineGalleryVelocity(galleryReleaseVelocity(samples, 136), carry, 136, 8);
    assert.ok(next > carry);
    carry = next;
  }
});
