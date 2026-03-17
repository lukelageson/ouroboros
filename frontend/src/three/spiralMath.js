import * as THREE from 'three';

// Spring equinox ~ March 20 = day 79 of year (non-leap)
const SPRING_EQUINOX_DAY = 79;
const DAYS_IN_YEAR = 365;
const MS_PER_DAY = 86400000;

/**
 * Return the day-of-year for a date, treating Feb 29 as nonexistent.
 * For leap years, Mar 1 and later are shifted back by 1 so that every
 * calendar date stacks at the same angle across years.
 */
function _dayOfYear(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  let doy = (d - start) / MS_PER_DAY;

  // In a leap year, if we are on or after Mar 1, subtract 1 to skip Feb 29's slot
  const isLeap = (yr => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0)(d.getFullYear());
  if (isLeap && d.getMonth() >= 2) {
    doy -= 1;
  }
  return doy;
}

/**
 * Fraction of the calendar year elapsed (0.0–1.0).
 * Jan 1 ≈ 0.0, Dec 31 ≈ 1.0.
 */
export function dateToYearFraction(date) {
  return _dayOfYear(date) / DAYS_IN_YEAR;
}

/**
 * Angle in radians for a calendar date.
 * Spring equinox (Mar 20) = 0, Summer = π/2, Fall = π, Winter = 3π/2 (or -π/2).
 */
export function dateToAngle(date) {
  const dayOfYear = _dayOfYear(date);

  // Days since spring equinox, wrapped
  const daysSinceSpring = (dayOfYear - SPRING_EQUINOX_DAY + DAYS_IN_YEAR) % DAYS_IN_YEAR;
  return (daysSinceSpring / DAYS_IN_YEAR) * 2 * Math.PI;
}

/**
 * Inverse of dateToAngle: given a world-space spiral angle (radians), return
 * the calendar Date closest in time to focusDate (searches ±1 year).
 */
export function angleToDate(angle, focusDate) {
  // Normalize to [0, 2π)
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;

  const daysSinceSpring = (a / (2 * Math.PI)) * DAYS_IN_YEAR;
  const doy = (daysSinceSpring + SPRING_EQUINOX_DAY) % DAYS_IN_YEAR;

  const refTime = new Date(focusDate).getTime();
  const refYear = new Date(focusDate).getFullYear();

  let bestDate = null, bestDiff = Infinity;
  for (let yr = refYear - 1; yr <= refYear + 1; yr++) {
    const jan1      = new Date(yr, 0, 1).getTime();
    const candidate = new Date(jan1 + Math.round(doy) * MS_PER_DAY);
    const diff      = Math.abs(candidate.getTime() - refTime);
    if (diff < bestDiff) { bestDiff = diff; bestDate = candidate; }
  }
  return bestDate;
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
  const radius = 40;
  const angle = dateToAngle(date);
  const x = radius * Math.cos(angle);
  const z = radius * Math.sin(angle);
  const y = yearsElapsed * 8;

  return new THREE.Vector3(x, y, z);
}
