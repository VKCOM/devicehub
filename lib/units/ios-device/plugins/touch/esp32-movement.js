export const SINGLE_STEP_SIZE = 1
export const BIG_STEP_SIZE = 4
export const HUGE_STEP_SIZE = 8
export const POSITION_TOLERANCE = 1

export function getStep(diff) {
    const distance = Math.abs(diff)
    let magnitude = SINGLE_STEP_SIZE
    if (distance >= BIG_STEP_SIZE) {
        magnitude = BIG_STEP_SIZE
    }
    if (distance >= HUGE_STEP_SIZE) {
        magnitude = HUGE_STEP_SIZE
    }

    return Math.sign(diff) * magnitude
}

export function getDirection(axis, step) {
    const directions = {
        x: {positive: ['R', 'r', 'k'], negative: ['L', 'l', 'g']},
        y: {positive: ['D', 'd', 'h'], negative: ['U', 'u', 'j']}
    }
    const magnitude = Math.abs(step)
    let index = 0
    if (magnitude === BIG_STEP_SIZE) {
        index = 1
    }
    if (magnitude === HUGE_STEP_SIZE) {
        index = 2
    }

    return (step > 0 ? directions[axis].positive : directions[axis].negative)[index]
}
