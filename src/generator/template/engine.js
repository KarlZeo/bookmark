const fs = require('node:fs');
const path = require('node:path');
const Handlebars = require('handlebars');

const { registerAllHelpers } = require('../../helpers');
const { createLogger, isVerbose } = require('../utils/logger');

const log = createLogger('template');

const handlebars = Handlebars.create();
registerAllHelpers(handlebars);

function loadHandlebarsTemplates() {
  const templatesDir = path.join(process.cwd(), 'templates');

  if (!fs.existsSync(templatesDir)) {
    throw new Error('Templates directory not found. Cannot proceed without templates.');
  }

  const layoutsDir = path.join(templatesDir, 'layouts');
  if (!fs.existsSync(layoutsDir)) {
    throw new Error('Layouts directory not found. Cannot proceed without layout templates.');
  }

  fs.readdirSync(layoutsDir)
    .filter((file) => file.endsWith('.hbs'))
    .sort()
    .forEach((file) => {
      const layoutName = path.basename(file, '.hbs');
      const layoutPath = path.join(layoutsDir, file);
      const layoutContent = fs.readFileSync(layoutPath, 'utf8');
      handlebars.registerPartial(layoutName, layoutContent);
    });

  const componentsDir = path.join(templatesDir, 'components');
  if (!fs.existsSync(componentsDir)) {
    throw new Error('Components directory not found. Cannot proceed without component templates.');
  }

  fs.readdirSync(componentsDir)
    .filter((file) => file.endsWith('.hbs'))
    .sort()
    .forEach((file) => {
      const componentName = path.basename(file, '.hbs');
      const componentPath = path.join(componentsDir, file);
      const componentContent = fs.readFileSync(componentPath, 'utf8');
      handlebars.registerPartial(componentName, componentContent);
    });

  const defaultLayoutPath = path.join(layoutsDir, 'default.hbs');
  if (!fs.existsSync(defaultLayoutPath)) {
    throw new Error('Default layout template not found. Cannot proceed without default layout.');
  }
}

function getDefaultLayoutTemplate() {
  const defaultLayoutPath = path.join(process.cwd(), 'templates', 'layouts', 'default.hbs');

  if (!fs.existsSync(defaultLayoutPath)) {
    throw new Error('Default layout template not found. Cannot proceed without default layout.');
  }

  try {
    const layoutContent = fs.readFileSync(defaultLayoutPath, 'utf8');
    const layoutTemplate = handlebars.compile(layoutContent);

    return {
      path: defaultLayoutPath,
      template: layoutTemplate,
    };
  } catch (error) {
    throw new Error(`Error loading default layout template: ${error.message}`);
  }
}

function renderTemplate(templateName, data, useLayout = true) {
  const templatePath = path.join(process.cwd(), 'templates', 'pages', `${templateName}.hbs`);

  if (!fs.existsSync(templatePath)) {
    const genericTemplatePath = path.join(process.cwd(), 'templates', 'pages', 'page.hbs');

    if (!fs.existsSync(genericTemplatePath)) {
      throw new Error(
        `Template ${templateName}.hbs not found and generic template page.hbs not found. Cannot proceed without template.`
      );
    }

    if (isVerbose()) {
      log.info('页面模板不存在，已回退到通用模板 page.hbs', { template: `${templateName}.hbs` });
    } else {
      log.warn('页面模板不存在，已回退到通用模板 page.hbs', { template: `${templateName}.hbs` });
    }
    const genericTemplateContent = fs.readFileSync(genericTemplatePath, 'utf8');
    const genericTemplate = handlebars.compile(genericTemplateContent);

    const enhancedData = {
      ...data,
      pageId: data && data.pageId ? data.pageId : templateName,
    };

    const pageContent = genericTemplate(enhancedData);
    if (!useLayout) return pageContent;

    const { template: layoutTemplate } = getDefaultLayoutTemplate();
    return layoutTemplate({ ...enhancedData, body: pageContent });
  }

  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);

    const pageContent = template(data);
    if (!useLayout) return pageContent;

    const { template: layoutTemplate } = getDefaultLayoutTemplate();
    return layoutTemplate({ ...data, body: pageContent });
  } catch (error) {
    throw new Error(`Error rendering template ${templateName}: ${error.message}`);
  }
}

module.exports = {
  handlebars,
  loadHandlebarsTemplates,
  getDefaultLayoutTemplate,
  renderTemplate,
};
