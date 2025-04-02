interface ITouch {
    // A touch interface is aware of screen dimensions

    /**
     * Move to a space on the screen
     * @param x width position from 0 to 1
     * @param y height position from 0 to 1
     */
    move(x: number, y: number): Promise<void>

    /**
     * Hold down the mouse button
     */
    touchDown(): Promise<void>

    /**
     * Release the mouse button
     */
    touchUp(): Promise<void>
}
