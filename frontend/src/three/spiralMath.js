import * as THREE from 'three';

// Spring equinox ~ March 20 = day 79 of year (non-leap)
const SPRING_EQUINOX_DAY = 79;
const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY = 86400000;

/**
 * Fraction of the calendar year elapsed (0.0–1.0).
 * Jan 1 ≈ 0.0, Dec 31 ≈ 1.0.
 */
export function dateToYearFraction(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = (d - start) / MS_PER_DAY;
  return dayOfYear / DAYS_IN_YEAR;
}

/**
 * Angle in radians for a calendar date.
 * Spring equinox (Mar 20) = 0, Summer = π/2, Fall = π, Winter = 3π/2 (or -π/2).
 */
export function dateToAngle(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = (d - start) / MS_PER_DAY;

  // Days since spring equinox, wrapped
  const daysSinceSpring = (dayOfYear - SPRING_EQUINOX_DAY + DAYS_IN_YEAR) % DAYS_IN_YEAR;
  return (daysSinceSpring / DAYS_IN_YEAR) * 2 * Math.PI;
}

/**
 * 3D position on the spiral for a given date relative to a birthday.
 * - Y axis = time (birthday at Y=0, present at top)
 * - X/Z plane = seasonal angle (spring = +X, fall = -X)
 */
export function dateToPosition(date, birthday) {
  const d = new Date(date);
  const b = new Date(birthday);

  const yearsElapsed = (d - b) / (DAYS_IN_YEAR * MS_PER_DAY);
  const radius = 10 + yearsElapsed * 0.5;
  const angle = dateToAngle(date);
  const x = radius * Math.cos(angle);
  const z = radius * Math.sin(angle);
  const y = yearsElapsed * 8;

  return new THREE.Vector3(x, y, z);
}
