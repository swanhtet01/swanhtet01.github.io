import readline from 'node:readline'

export class TerminalPrompt {
  constructor(input, output) {
    this.input = input
    this.output = output
  }

  assertInteractive() {
    if (!this.input?.isTTY || !this.output?.isTTY || typeof this.input.setRawMode !== 'function') {
      throw new Error('interactive_terminal_required')
    }
  }

  read(prompt, { masked = false } = {}) {
    this.assertInteractive()
    this.output.write(prompt)
    readline.emitKeypressEvents(this.input)
    const previousRawMode = Boolean(this.input.isRaw)
    this.input.setRawMode(true)
    this.input.resume()
    let value = ''

    return new Promise((resolveValue, reject) => {
      const finish = (error) => {
        this.input.off('keypress', onKeypress)
        this.input.setRawMode(previousRawMode)
        this.output.write('\n')
        if (error) reject(error)
        else resolveValue(value)
      }
      const onKeypress = (text, key = {}) => {
        if (key.ctrl && key.name === 'c') { finish(new Error('activation_cancelled')); return }
        if (key.name === 'return' || key.name === 'enter') { finish(); return }
        if (key.name === 'backspace') {
          if (value) { value = value.slice(0, -1); this.output.write('\b \b') }
          return
        }
        if (key.ctrl || key.meta || !text || /[\r\n]/.test(text)) return
        if (value.length + text.length > 20_000) return
        value += text
        this.output.write(masked ? '*'.repeat([...text].length) : text)
      }
      this.input.on('keypress', onKeypress)
    })
  }

  async choose(group) {
    this.output.write(`\n${group.label}:\n`)
    group.inputNames.forEach((inputName, index) => this.output.write(`  ${index + 1}. ${inputName}\n`))
    const answer = (await this.read('Choose input [1]: ')).trim()
    const index = answer ? Number(answer) - 1 : 0
    if (!Number.isInteger(index) || index < 0 || index >= group.inputNames.length) {
      throw new Error(`guided_input_choice_invalid:${group.target}`)
    }
    return group.inputNames[index]
  }
}

export default TerminalPrompt
