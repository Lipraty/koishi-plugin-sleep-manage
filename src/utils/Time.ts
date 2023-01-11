/**
 * format Date to `HH:mm:ss`
 * @param time 
 */
export const fmtTime = (time: Date) => [time.getHours(), time.getMinutes(), time.getSeconds()].map(v => v.toString().length === 2 ? v : '0' + v).join(':')