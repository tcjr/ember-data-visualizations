import moment from 'moment';
import _ from 'lodash/lodash';
import d3 from 'd3';
import dc from 'dc';
import crossfilter from 'crossfilter';
import $ from 'jquery';
import BaseChartComponent from '../base-chart-component';

/**
   @public
   @module column-chart
   @type component
   @desc dc.js column chart
*/
export default BaseChartComponent.extend({
    classNames: ['column-chart'],

    showMaxMin: false,
    showComparisonLine: false,
    currentInterval: null,
    showCurrentIndicator: false,
    maxMinSeries: null,

    // Horizontal line to mark a target, average, or any kind of comparison value
    // Ex. { value: 0.8, displayValue: '80%', color: '#2CD02C' }
    comparisonLine: null,

    type: 'GROUPED', // GROUPED, LAYERED, STACKED

    buildChart() {
        let compositeChart = dc.compositeChart(`#${this.get('elementId')}`);

        compositeChart
            .transitionDuration(0)
            .renderTitle(false)
            .brushOn(false)
            .height(this.get('height'))
            .margins({
                top: 10,
                right: 100,
                bottom: 50,
                left: 100
            })
            .x(d3.time.scale().domain(this.get('xAxis').domain))
            .xUnits(() => this.get('group')[0].size() * (this.get('group').length + 1))
            .dimension(this.get('dimension'))
            .elasticY(true)
            .yAxisPadding('40%');

        if (this.get('width')) {
            compositeChart.width(this.get('width'));
        }

        if (this.get('yAxis') && this.get('yAxis').domain) {
            compositeChart.y(d3.scale.linear().domain(this.get('yAxis').domain));
        }

        if (this.get('currentInterval') && this.get('showCurrentIndicator') && this.get('xAxis') && this.get('xAxis').ticks) {
            compositeChart.xAxis().ticks(this.get('xAxis').ticks).tickValues(this.addTickForCurrentInterval());
        }

        compositeChart.xAxis().outerTickSize(0);
        if (this.get('xAxis') && this.get('xAxis').ticks) {
            compositeChart.xAxis().ticks(this.get('xAxis').ticks);
        }

        compositeChart.yAxis().outerTickSize(0);
        if (this.get('yAxis') && this.get('yAxis').ticks) {
            compositeChart.yAxis().ticks(this.get('yAxis').ticks);
        }

        let tip = this.createTooltip();
        let columnChart;
        let columnCharts = [];
        const groups = this.get('group');

        if (this.get('type') !== 'STACKED') {
            groups.forEach((g, index) => {
                // If we are hatching, we need to display a white bar behind the hatched bar
                if (!_.isEmpty(this.get('series')) && !_.isEmpty(this.get('series')[index]) && this.get('series')[index].hatch) {
                    columnChart = dc.barChart(compositeChart);

                    columnChart
                        .centerBar(true)
                        .barPadding(0.00)
                        .group(g)
                        .colors('white')
                        .renderTitle(false)
                        .elasticY(true);

                    columnCharts.push(columnChart);
                }

                columnChart = dc.barChart(compositeChart);

                columnChart
                    .centerBar(true)
                    .barPadding(0.00)
                    .group(g)
                    .colors(this.get('colors')[index])
                    .renderTitle(false)
                    .elasticY(true);

                columnCharts.push(columnChart);
            });
        } else {
            columnChart = dc.barChart(compositeChart);
            columnChart
                .centerBar(true)
                .barPadding(0.00)
                .group(groups[0])
                .renderTitle(false)
                .elasticY(true);
            groups.forEach((g, index) => {
                if (index != 0) {
                    columnChart.stack(g);
                }
            });
            columnCharts.push(columnChart);
        }

        compositeChart
            .on('pretransition', chart => this.onPretransition(chart, tip))
            .compose(columnCharts);

        this.set('chart', compositeChart);
    },

    createTooltip() {
        const formatter = this.get('xAxis.formatter') || (value => value);
        const titles = this.get('series').map(entry => entry.title);
        let tip = d3.tip().attr('class', 'd3-tip')
            .attr('id', this.get('elementId'))
            .html(d => {
                if (!_.isEmpty(titles)) {
                    let str = `<span class="tooltip-time">${moment(d.data.key).format(this.get('tooltipDateFormat'))}</span>`;
                    titles.forEach((title, i) => {
                        const datum = formatter(this.get('data')[d.data.key][i]);
                        const secondaryClass = d.y === datum ? 'primary-stat' : '';
                        str = str.concat(`<span class="tooltip-list-item"><span class="tooltip-label ${secondaryClass}">${title}</span><span class="tooltip-value ${secondaryClass}">${datum}</span></span>`);
                    });
                    return str;
                }

                return `<span>${moment(d.data.key).format('L')}</span><br/><span class="tooltip-value">${d.data.value}</span>`;
            });

        return tip;
    },

    doHatching(chart) {
        // Set up any necessary hatching patterns
        let svg = chart.select('svg > defs');

        this.get('series').forEach((series, index) => {
            if (series.hatch) {
                let rotateAngle = series.hatch === 'pos' ? 45 : -45;

                svg.append('pattern')
                    .attr('id', `diagonalHatch${index}`)
                    .attr('patternUnits', 'userSpaceOnUse')
                    .attr('width', 4)
                    .attr('height', 4)
                    .attr('patternTransform', `rotate(${rotateAngle})`)
                    .append('rect')
                    .attr('width', 2)
                    .attr('height', 4)
                    .attr('fill', this.get('colors')[index]);

                chart.selectAll(`.sub._${this.getIndexForHatch(index)} rect.bar`)
                    .attr('fill', `url(#diagonalHatch${index})`)
                    .attr('opacity', '.7');
            }
        });

        chart.selectAll('rect.bar')
            .attr('rx', '2')
            .attr('stroke', 'white');
    },

    handleBarWidth(chart) {
        const gap = 2;
        let bars = chart.selectAll('.sub._0 rect.bar')[0];
        const seriesCount = this.get('group').length;

        if (bars[0]) {
            let barWidth = (parseInt(d3.select(bars[0]).attr('width'), 10)) || 1;

            // if composed, double barWidth
            if (this.get('type') === 'LAYERED' || this.get('type') === 'STACKED') {
                let x;
                let barD3;
                chart.selectAll('rect.bar')[0].forEach(bar => {
                    barD3 = d3.select(bar);
                    x = parseInt(barD3.attr('x'), 10);
                    barD3.attr('x', x - barWidth * (this.get('group').length - 1) / 2 + 1);
                });

                barWidth *= this.get('group').length; // number of series
            }

            let position = -1 * (barWidth + gap);

            for (let i = 0; i < seriesCount; i++) {
                if (this.get('type') === 'GROUPED') {
                    chart.selectAll(`g.sub._${i}`)
                        .attr('transform', `translate(${position},0)`);
                }

                position = position + (barWidth + gap);
            }
            chart.selectAll('rect.bar')
                .attr('width', barWidth);
        }
    },

    onPretransition(chart, tip) {
        // This is outside the Ember run loop so check if component is destroyed
        if (this.get('isDestroyed') || this.get('isDestroying')) {
            return;
        }

        if (this.get('type') === 'STACKED') {
            const colors = this.get('colors');
            chart.selectAll('g.stack').selectAll('rect').attr('fill', (d) => colors[d.layer]);
        }

        this.doHatching(chart);
        this.handleBarWidth(chart);

        let svg = chart.select('svg > defs');
        let bars = chart.selectAll('.sub._0 rect.bar')[0];

        this.addClickHandlersAndTooltips(svg, tip, 'rect.bar');

        $(`#${this.get('elementId')} #inline-labels`).remove();

        if (this.get('showMaxMin') && _.isNumber(this.get('seriesMaxMin')) && bars.length > 0) {
            this.addMaxMinLabels(bars);
        }

        if (this.get('showComparisonLine') && this.get('comparisonLine') && !_.isEmpty(this.get('data'))) {
            this.addComparisonLine();
        }

        if (this.get('showCurrentIndicator') && this.get('currentInterval')) {
            this.changeTickForCurrentInterval();
        }
    },

    getIndexForHatch(idx) {
        let count = 0;
        for (let i = 0; i <= idx; i++) {
            if (this.get('series')[i] && this.get('series')[i].hatch) {
                count++;
            }
        }
        return count + idx;
    },

    isIntervalIncluded(ticks, interval) {
        return ticks.toString().includes(interval.toString());
    },

    isIntervalInRange(scale, interval) {
        return (scale.ticks().pop() >= interval && scale.ticks()[0] <= interval);
    },

    addTickForCurrentInterval() {
        // if indicatorDate is in range but not already in the scale, add it.
        let xTimeScale = d3.time.scale().domain(this.get('xAxis').domain);
        let indicatorDate = this.get('currentInterval') ? this.get('currentInterval.start._d') : null;
        let ticks = xTimeScale.ticks(this.get('xAxis').ticks);
        if (!this.isIntervalIncluded(ticks, indicatorDate) && this.isIntervalInRange(xTimeScale, indicatorDate)) {
            ticks.push(indicatorDate);
        }
        return ticks;
    },

    changeTickForCurrentInterval() {
        // this method should be called on renderlet
        let indicatorDate = this.get('currentInterval.start._d');
        let xTimeScale = d3.time.scale().domain(this.get('xAxis').domain);
        if (this.isIntervalInRange(xTimeScale, indicatorDate)) {
            let currentTick = d3.select('.column-chart > svg > g > g.axis').selectAll('g.tick')
                .filter(d => d.toString() === indicatorDate.toString());
            if (!currentTick.empty()) {
                if (currentTick.select('text').text().indexOf('\u25C6') === -1) {
                    let tickHtml = this.isIntervalIncluded(xTimeScale.ticks(this.get('xAxis').ticks), indicatorDate) ? `\u25C6 ${currentTick.text()}` : '\u25C6';
                    currentTick.select('text').html(tickHtml);
                }
            }
        }
    },

    addComparisonLine() {
        const chartBody = d3.select('.column-chart > svg > g');
        const line = this.get('comparisonLine');

        this.get('chart').selectAll('.comparison-line').remove();
        this.get('chart').selectAll('#comparison-text').remove();

        chartBody.append('svg:line')
            .attr('x1', 100)
            .attr('x2', this.get('chart').width() - 95)
            .attr('y1', 10 + this.get('chart').y()(line.value))
            .attr('y2', 10 + this.get('chart').y()(line.value))
            .attr('class', 'comparison-line')
            .style('stroke', line.color || '#2CD02C');

        chartBody.append('svg:line')
            .attr('x1', 100)
            .attr('x2', 100)
            .attr('y1', 15 + this.get('chart').y()(line.value))
            .attr('y2', 5 + this.get('chart').y()(line.value))
            .attr('class', 'comparison-line')
            .style('stroke', line.color || '#2CD02C');

        chartBody.append('svg:line')
            .attr('x1', this.get('chart').width() - 95)
            .attr('x2', this.get('chart').width() - 95)
            .attr('y1', 15 + this.get('chart').y()(line.value))
            .attr('y2', 5 + this.get('chart').y()(line.value))
            .attr('class', 'comparison-line')
            .style('stroke', line.color || '#2CD02C');

        chartBody.append('text')
            .text(line.displayValue)
            .attr('x', 80)
            .attr('y', 14 + this.get('chart').y()(line.value))
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('id', 'comparison-text')
            .attr('fill', line.textColor || '#000000');
    },

    addMaxMinLabels(bars) {
        let formatter = this.get('xAxis.formatter') || (value => value);
        let maxValue, maxIdx, minValue, minIdx, values, nonZeroValues;
        let groups = this.get('group');
        groups.forEach((g, index) => {
            if (this.get('showMaxMin') && _.isNumber(this.get('seriesMaxMin'))) {
                if (index === this.get('seriesMaxMin')) {
                    values = g.all().map(gElem => gElem.value);
                    nonZeroValues = values.filter(v => v > 0);
                    maxValue = _.max(nonZeroValues);
                    maxIdx = values.indexOf(maxValue);
                    maxValue = formatter(maxValue);
                    minValue = _.min(nonZeroValues);
                    minIdx = values.indexOf(minValue);
                    minValue = formatter(minValue);
                }
            }
        });
        let gLabels = d3.select(bars[0].parentNode).append('g').attr('id', 'inline-labels');
        let b = bars[maxIdx];

        // Choose the tallest bar in the stack (lowest y value) and place the max/min labels above that.
        // Avoids label falling under any bar in the stack.
        const maxLabelY = Math.min(...this.get('chart').selectAll('.sub rect.bar')[0].map(rect => parseInt(rect.getAttribute('y'), 10)));

        if (b) {
            gLabels.append('text')
                .text(maxValue)
                .attr('x', +b.getAttribute('x') + (b.getAttribute('width') / 2))
                .attr('y', Math.max(12, maxLabelY - 2))
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .attr('fill', this.get('colors')[this.get('seriesMaxMin')])
                .attr('class', 'max-value-text');

            if (!(maxIdx === minIdx)) {
                gLabels.append('text')
                    // unicode for font-awesome caret up
                    .html(() => '&#xf0d8')
                    .attr('text-anchor', 'middle')
                    .attr('class', 'caret-icon max-value-indicator')
                    .attr('x', +b.getAttribute('x') + (b.getAttribute('width') / 2))
                    .attr('y', maxLabelY - 12);
            }
        }
        b = bars[minIdx];

        if (b && !(maxIdx === minIdx)) {
            gLabels.append('text')
                .text(minValue)
                .attr('x', +b.getAttribute('x') + (b.getAttribute('width') / 2))
                .attr('y', Math.max(12, maxLabelY - 2))
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .attr('fill', this.get('colors')[this.get('seriesMaxMin')])
                .attr('class', 'min-value-text');

            gLabels.append('text')
                // unicode for font-awesome caret down
                .html(() => '&#xf0d7')
                .attr('class', 'caret-icon min-value-indicator')
                .attr('text-anchor', 'middle')
                .attr('x', +b.getAttribute('x') + (b.getAttribute('width') / 2))
                .attr('y', maxLabelY - 12);
        }
    },

    showChartNotAvailable() {
        const chartNotAvailableMessage = this.get('chartNotAvailableMessage');
        const chartNotAvailableColor = this.get('chartNotAvailableColor');
        const chartNotAvailableTextColor = this.get('chartNotAvailableTextColor');
        const xAxis = this.get('xAxis');
        const yAxis = this.get('yAxis');

        let columnChart = dc.barChart(`#${this.get('elementId')}`);
        this.set('chart', columnChart);

        const duration = moment.duration(xAxis.domain[1].diff(xAxis.domain[0]));
        let ticks = 30;
        if (duration.asMonths() >= 1) {
            ticks = duration.asDays();
        } else if (duration.asWeeks() >= 1) {
            ticks = 30;
        } else if (duration.asDays() >= 1) {
            ticks = 24;
        }

        const data = d3.time.scale().domain(xAxis.domain).ticks(ticks);
        const filter = crossfilter(data);
        const dimension = filter.dimension(d => d);
        const group = dimension.group().reduceCount(g => g);

        columnChart
            .centerBar(true)
            .barPadding(0.00)
            .colors(chartNotAvailableColor)
            .renderTitle(false)
            .brushOn(false)
            .height(this.get('height'))
            .margins({
                top: 10,
                right: 100,
                bottom: 50,
                left: 100
            })
            .x(d3.time.scale().domain(xAxis.domain))
            .xUnits(() => data.length + 1)
            .y(d3.scale.linear().domain([0, 1]))
            .group(group)
            .dimension(dimension)
            .transitionDuration(0);

        if (this.get('width')) {
            this.get('chart').width(this.get('width'));
        }

        columnChart.on('pretransition', chart => {
            // This is outside the Ember run loop so check if component is destroyed
            if (this.get('isDestroyed') || this.get('isDestroying')) {
                return;
            }

            // Set up any necessary hatching patterns
            let svg = d3.select('.column-chart > svg > defs');

            svg
                .append('clippath')
                .attr('id', 'topclip')
                .append('rect')
                .attr('x', '0')
                .attr('y', '0')
                .attr('width', 200)
                .attr('height', 200);
            svg
                .append('pattern')
                .attr('id', 'chartNotAvailableHatch')
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('width', 4)
                .attr('height', 4)
                .attr('patternTransform', 'rotate(45)')
                .append('rect')
                .attr('x', '0')
                .attr('y', '0')
                .attr('width', 2)
                .attr('height', 4)
                .attr('fill', chartNotAvailableColor);

            chart.selectAll('rect.bar')
                .attr('fill', 'url(#chartNotAvailableHatch)')
                .attr('opacity', '.7')
                .attr('rx', '2')
                .attr('stroke', 'white');
        });

        columnChart.on('postRender', () => {
            // This is outside the Ember run loop so check if component is destroyed
            if (this.get('isDestroyed') || this.get('isDestroying')) {
                return;
            }

            this.get('chart').select('svg > text').remove();
            let svg = this.get('chart').select('svg');
            let bbox = svg.node().getBBox();
            svg
                .append('text')
                .text(chartNotAvailableMessage)
                .style('fill', chartNotAvailableTextColor)
                .attr('class', 'chart-not-available')
                .attr('text-anchor', 'middle')
                .attr('y', bbox.y + (bbox.height / 2))
                .attr('x', bbox.x + (bbox.width / 2));
        });
        if (xAxis && xAxis.ticks) {
            this.get('chart').xAxis().ticks(xAxis.ticks);
        }
        if (yAxis && yAxis.ticks) {
            this.get('chart').yAxis().ticks(yAxis.ticks);
        }

        columnChart.render();
    }
});