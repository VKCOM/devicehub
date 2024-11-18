export default function (plop) {
  plop.setGenerator('component', {
    description: 'Создать компонент',
    prompts: [
      {
        type: 'list',
        name: 'folderName',
        message: 'В какой папке вы хотите создать компонент?',
        choices: ['ui', 'lib', 'layouts', 'views'],
      },
      {
        type: 'input',
        name: 'componentName',
        message: 'Какое будет название у компонента?',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'src/components/{{kebabCase folderName}}/{{kebabCase componentName}}/{{kebabCase componentName}}.tsx',
        templateFile: 'plop-templates/component.tsx.hbs',
      },
      {
        type: 'add',
        path: 'src/components/{{kebabCase folderName}}/{{kebabCase componentName}}/{{kebabCase componentName}}.module.css',
        templateFile: 'plop-templates/component.module.css.hbs',
      },
      {
        type: 'add',
        path: 'src/components/{{kebabCase folderName}}/{{kebabCase componentName}}/index.ts',
        templateFile: 'plop-templates/index.ts.hbs',
      },
    ],
  })
}
