import L from 'leaflet';

/**
 *
 * @param f
 * @returns {boolean}
 */

const isFunction = f => typeof f === 'function';

/**
 *
 * @param l
 * @returns {boolean}
 */

const isLevel = l => typeof l === 'number' || !isNaN(parseInt(l, 10));

/**
 *
 * @param n
 * @returns {boolean}
 */

const isEmpty = n => n === '' || n === undefined || n === null;







/**
 * A layer that will display indoor data
 *
 * addData takes a GeoJSON feature collection, each feature must have a level
 * property that indicates the level.
 *
 * getLevels can be called to get the array of levels that are present.
 */

L.Indoor = L.Class.extend({

    options: {
        // by default the levels are expected to be in the level attribute in
        // the feature properties, pass a replacement function in options if
        // this is not the case.
        getLevel(feature) {
            return feature.properties.level;
        }
    },

    initialize(data, options) {
        L.setOptions(this, options);

        const layers = this._layers = {};
        this._map = null;

        if ('level' in this.options) {
            this._level = this.options.level;
        } else {
            this._level = null;
        }

        if ('onSetLevel' in this.options && isFunction(this.options['onSetLevel'])) {
            this._onSetLevel = this.options.onSetLevel;
        } else {
            this._onSetLevel = function (level) {};
        }

        if ('onEachFeature' in this.options && isFunction(this.options['onEachFeature'])) {
            var onEachFeature = this.options.onEachFeature;
        }

        this.options.onEachFeature = function (feature, layer) {
            if (onEachFeature) {
                onEachFeature(feature, layer);
            }

            if ('markerForFeature' in this.options && isFunction(this.options['markerForFeature'])) {
                const marker = this.options['markerForFeature'](feature);

                if (marker instanceof L.Marker) {
                    marker.on('click', (e) => {
                        layer.fire('click', e);
                    });

                    const level = this.options.getLevel(feature);

                    if (L.Util.isArray(level)) {
                        function addToLevel(level) {
                            if (!isLevel(level)) return;
                            layers[level].addLayer(marker);
                        }

                        level.forEach(addToLevel);
                    }

                    if (isLevel(level)) {
                        layers[level].addLayer(marker);
                    }
                }
            }
        };

        this.addData(data);
    },

    addTo(map) {
        map.addLayer(this);
        return this;
    },

    onAdd(map) {
        this._map = map;

        if (!isLevel(this._level)) {
            const levels = this.getLevels();

            if (levels.length !== 0) {
                this._level = levels[0];
            }
        } else {
            if (this._level in this._layers) {
                this._map.addLayer(this._layers[this._level]);
            }
        }
    },

    onRemove() {
        if (this._level in this._layers) {
            this._map.removeLayer(this._layers[this._level]);
        }

        this._map = null;
    },

    addData(data) {
        let layers = this._layers,
            options = this.options;

        data.forEach((indoor_map) => {
            const map_level = indoor_map.level;
            if (!isLevel(map_level)) {
                return;
            }

            // Tile
            let layer;
            if (map_level in layers) {
                layer = layers[map_level];
            } else {
                layer = layers[map_level] = L.geoJson({
                    type: 'FeatureCollection',
                    features: [],
                }, options);
            }

            if (isEmpty(indoor_map['tiles_url_base'])) {
                console.warn('No tiles layer defined for map');
            } else {
                if (!options.grayscale) {
                    L.tileLayer(indoor_map['tiles_url_base'], {
                        tms: true,
                        maxZoom: 23,
                        bounds: indoor_map['map_bounds'],
                    }).addTo(layer);
                } else {
                    L.tileLayer.grayscale(indoor_map['tiles_url_base'], {
                        tms: true,
                        maxZoom: 23,
                        bounds: indoor_map['map_bounds'],
                        fadeAnimation: false,
                    }).addTo(layer);
                }
            }

            // Features
            const features = indoor_map['map_features']['features'];
            features.forEach((feature) => {
                const level = options.getLevel(feature);
                let layer;

                if (!isLevel(level)) {
                    console.warn('No level defined for feature');
                    return;
                }

                if (!('geometry' in feature)) {
                    return;
                }

                if (!('display_on_level' in feature)) {
                    // Display only the features that have a display flag in order to control what is shown...
                    return;
                }

                // if the feature is on multiple levels
                if (L.Util.isArray(level)) {
                    level.forEach((level) => {
                        if (level in layers) {
                            layer = layers[level];
                        } else {
                            layer = layers[level] = L.geoJson({
                                type: 'FeatureCollection',
                                features: [],
                            }, options);
                        }

                        layer.addData(feature);
                    });
                // feature is on a single level
                } else {
                    if (level in layers) {
                        layer = layers[level];
                    } else {
                        layer = layers[level] = L.geoJson({
                            type: 'FeatureCollection',
                            features: [],
                        }, options);
                    }

                    layer.addData(feature);
                }
            });
        });
    },
    getLevels() {
        return Object.keys(this._layers);
    },
    getLevel() {
        return this._level;
    },
    setLevel(level) {
        if (typeof level === 'object') {
            level = level.newLevel;
        }

        if (this._level === level || !isLevel(level)) {
            return;
        }

        const oldLayer = this._layers[this._level];
        const layer = this._layers[level];

        this._onSetLevel(level);

        if (this._map !== null) {
            if (this._map.hasLayer(oldLayer)) {
                this._map.removeLayer(oldLayer);
            }

            if (layer) {
                this._map.addLayer(layer);
                this._level = level;
            }
        }
    },
    resetStyle(layer) {
        // reset any custom styles
        layer.options = layer.defaultOptions;
        this._setLayerStyle(layer, this.options.style);
        return this;
    },
    _setLayerStyle(layer, style) {
        if (typeof style === 'function') {
            style = style(layer.feature);
        }

        if (layer.setStyle) {
            layer.setStyle(style);
        }
    },
});

L.indoor = function (data, options) {
    return new L.Indoor(data, options);
};

L.Control.Level = L.Control.extend({
    includes: L.Mixin.Events,

    options: {
        position: 'bottomright',

        // used to get a unique integer for each level to be used to order them
        parseLevel(level) {
            return parseInt(level, 10);
        }
    },

    initialize(options) {
        L.setOptions(this, options);
        this._map = null;
        this._buttons = {};
        this._listeners = [];
        this._level = this.options.level;

        this.addEventListener('levelchange', this._levelChange, this);
    },

    onAdd(map) {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

        div.style.font = "18px 'Lucida Console',Monaco,monospace";

        const buttons = this._buttons;
        const activeLevel = this._level;
        const self = this;

        const levels = [];

        for (let i = 0, l = this.options.levels.length; i <l; i += 1) {
            let level = this.options.levels[i];

            const levelNum = self.options.parseLevel(level);

            levels.push({
                num: levelNum,
                label: level,
            });
        }

        levels.sort((a, b) => a.num - b.num);

        for (let i = levels.length - 1; i >= 0; i--) {
            let level = levels[i].num;
            const originalLevel = levels[i].label;

            let levelBtn = L.DomUtil.create('a', 'leaflet-button-part', div);

            if (level === activeLevel || originalLevel === activeLevel) {
                levelBtn.style.backgroundColor = '#b0b0b0';
            }

            levelBtn.appendChild(levelBtn.ownerDocument.createTextNode(originalLevel));

            (function (level) {
                levelBtn.onclick = function () {
                    self.setLevel(level);
                };
            }(level));

            buttons[level] = levelBtn;
        }

        return div;
    },

    _levelChange(e) {
        if (this._map !== null) {
            if (typeof e.oldLevel !== 'undefined') {
                this._buttons[e.oldLevel].style.backgroundColor = '#ffffff';
            }
            this._buttons[e.newLevel].style.backgroundColor = '#b0b0b0';
        }
    },

    setLevel(level) {
        if (level === this._level) {
            return;
        }

        const oldLevel = this._level;
        this._level = level;

        this.fireEvent('levelchange', {
            oldLevel,
            newLevel: level,
        });
    },

    getLevel() {
        return this._level;
    },
});

L.Control.level = function (options) {
    return new L.Control.Level(options);
};
