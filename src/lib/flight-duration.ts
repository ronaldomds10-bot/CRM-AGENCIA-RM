type FlightSchedule = {
  departureDate: string;
  departureTime: string;
  departureTimeZone: string;
  arrivalDate?: string;
  arrivalTime: string;
  arrivalTimeZone: string;
};

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function localTimeAsUtc(date: string, time: string, timeZone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !timeZone) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(target).toISOString().slice(0, 10) !== date) return null;

  try {
    let formatter = zoneFormatters.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      zoneFormatters.set(timeZone, formatter);
    }
    const displayedTime = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]));
      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    };
    let instant = target;
    for (let attempt = 0; attempt < 3; attempt++) {
      const difference = target - displayedTime(instant);
      if (!difference) return instant;
      instant += difference;
    }
    return displayedTime(instant) === target ? instant : null;
  } catch {
    return null;
  }
}

export function flightDurationMinutes(schedule: FlightSchedule): number | null {
  const departure = localTimeAsUtc(schedule.departureDate, schedule.departureTime, schedule.departureTimeZone);
  if (departure === null) return null;
  const arrivalDate = schedule.arrivalDate || schedule.departureDate;
  let arrival = localTimeAsUtc(arrivalDate, schedule.arrivalTime, schedule.arrivalTimeZone);
  if (arrival === null) return null;

  if (arrival <= departure && arrivalDate === schedule.departureDate) {
    const [year, month, day] = schedule.departureDate.split("-").map(Number);
    const nextDay = Date.UTC(year, month - 1, day + 1);
    for (let days = 1; days <= 2 && arrival <= departure; days++) {
      const date = new Date(nextDay + (days - 1) * 86400000).toISOString().slice(0, 10);
      arrival = localTimeAsUtc(date, schedule.arrivalTime, schedule.arrivalTimeZone);
      if (arrival === null) return null;
    }
  }

  const minutes = Math.round((arrival - departure) / 60000);
  return minutes > 0 && minutes < 48 * 60 ? minutes : null;
}
